import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createActions } from '../src/actions.js';
import { catalog, commands } from '../src/catalog.js';
import { defaults, identifier, loaded, settingsFile } from '../src/core.js';
import { Players } from '../src/player.js';
import { serverFor, statusReader } from '../src/web.js';

const listen = async (t, server) => {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
};

test('all 70 commands have unique names and valid option order', () => {
  assert.deepEqual(catalog.categories.map(category => category.commands.length), [15,10,15,15,10,5]);
  assert.equal(new Set(commands.map(command => command.name)).size, 70);
  for (const command of commands) {
    assert.match(command.name, /^[a-z0-9-]{1,32}$/);
    assert.ok(command.description.length <= 100);
    assert.ok(command.options.every((option, index, entries) => !option.required || entries.slice(0,index).every(entry => entry.required)));
  }
  assert.equal(catalog.sources.length, 12);
});

test('source resolution separates searches, approved providers, and direct hosts', () => {
  const hosts = new Set(['radio.example:8000']);
  assert.equal(identifier('Artist: Title','youtube',hosts),'ytsearch:Artist: Title');
  assert.equal(identifier('https://open.spotify.com/track/demo','youtube',hosts),'https://open.spotify.com/track/demo');
  assert.equal(identifier('http://radio.example:8000/live','youtube',hosts),'http://radio.example:8000/live');
  assert.throws(() => identifier('http://radio.example/live','youtube',hosts), /not configured/);
  assert.throws(() => identifier('https://youtube.com.example/live','youtube',hosts), /not configured/);
  assert.throws(() => identifier('ftp://example.test/music','youtube',hosts), /could not be read/);
  const a = { encoded:'test' };
  assert.deepEqual(loaded({loadType:'search',data:[a,a]}), [a]);
  assert.deepEqual(loaded({loadType:'playlist',data:{tracks:[a,a]}}), [a,a]);
  assert.throws(() => loaded({loadType:'error',data:{message:'private upstream error'}}), /could not load/);
});

test('independent settings writes survive reopening the data file', async t => {
  const directory = await mkdtemp(join(tmpdir(),'headnote-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const path = join(directory,'settings.json');
  const store = await settingsFile(path);
  await Promise.all([store.set('one',{volume:70}),store.set('two',{source:'soundcloud'}),store.set('one',{announcements:true})]);
  const reopened = await settingsFile(path);
  assert.equal(reopened.get('one').volume, 70);
  assert.equal(reopened.get('one').announcements, true);
  assert.equal(reopened.get('two').source, 'soundcloud');
  await reopened.set('one',null);
  assert.deepEqual(reopened.get('one'),defaults);
});

test('an old end event cannot clear replacement playback, even for the same track', async () => {
  const player = new EventEmitter();
  player.playTrack = async payload => { player.payload = payload; };
  const manager = new Players({}, {}, { get: () => defaults });
  const session = { id:'server', player, queue:[], history:[], loop:'off' };
  manager.sessions.set(session.id,session);
  const track = { encoded:'same', info:{ title:'Repeated track' } };
  await manager.start(session,track);
  const old = player.payload.track;
  await manager.start(session,track);
  await manager.onEnd(session,{ track:old, reason:'finished' });
  assert.equal(session.current,track);
  assert.equal(session.history.length,0);
  await manager.onEnd(session,{ track:player.payload.track, reason:'finished' });
  assert.equal(session.current,null);
  assert.equal(session.history[0],track);
  clearTimeout(session.timer);
});

test('queue and playback actions dispatch through the slash command handler', async () => {
  const player = new EventEmitter();
  player.playTrack = async payload => { player.paused = payload.paused; player.payload = payload; };
  player.update = async payload => { player.payload = payload; player.paused = payload.paused; };
  player.setPaused = async paused => { player.paused = paused; };
  const track = label => ({ encoded:label, info:{ title:label, isSeekable:true, length:30000 } });
  const client = {};
  const settings = { get: () => defaults };
  const manager = new Players(client, { getIdealNode: () => ({
    rest: { resolve: async () => ({ loadType:'playlist', data:{ tracks:[track('First'),track('Second'),track('Third')] } }) },
  }) }, settings);
  const session = { id:'server', channelId:'voice', player, queue:[], history:[] };
  manager.sessions.set(session.id,session);
  const actions = createActions({client,players:manager,settings,directHosts:new Set()});
  const member = { voice:{ channel:{ id:'voice', type:2, permissionsFor:()=>({has:()=>true}) } } };
  function invoke(name, inputs = {}) {
    return actions(commands.find(command => command.name === name), {
      guildId:'server', user:{id:'member'}, memberPermissions:{has:() => false},
      guild:{ members:{ cache:new Map([['member',member]]) } },
      options:{getString:key=>inputs[key] ?? null, getInteger:key=>inputs[key] ?? null, getNumber:key=>inputs[key] ?? null},
    });
  }
  await invoke('play',{query:'playlist'});
  assert.equal(session.current.info.title,'First');
  await invoke('queue-swap',{first:1,second:2});
  await invoke('skip');
  assert.equal(session.current.info.title,'Third');
  await invoke('pause');
  await invoke('seek',{seconds:7});
  assert.deepEqual(player.payload,{position:7000,paused:true});
  await invoke('nightcore');
  assert.equal(player.payload.paused,true);
  assert.equal(player.payload.filters.timescale.speed,1.22);
});

test('status API reads a mocked Lavalink node without exposing credentials', async t => {
  let probes = 0;
  const mock = createServer((request,response) => {
    assert.equal(request.url,'/v4/info');
    assert.equal(request.headers.authorization,'test-only-secret');
    probes++;
    response.setHeader('Content-Type','application/json');
    response.end(JSON.stringify({ version:{semver:'4.2.2'},sourceManagers:['youtube','Pandora','http'] }));
  });
  const nodeUrl = await listen(t,mock);
  const status = statusReader({ client:{ isReady:()=>true,ws:{ping:25} }, configured:true, discordConfigured:true,
    nodeUrl, password:'test-only-secret', shoukaku:{getIdealNode:()=>({sessionId:'session'})}, players:{sessions:new Map()} });
  const url = await listen(t,serverFor(status,()=>null));
  const response = await fetch(url + '/api/status');
  assert.equal(response.status,200);
  const body = await response.text();
  assert.ok(!body.includes('test-only-secret'));
  assert.ok(!body.includes(nodeUrl));
  const data = JSON.parse(body);
  assert.equal(data.discord.state,'connected');
  assert.equal(data.lavalink.gateway,'connected');
  assert.equal(data.sources.Pandora,'reported');
  assert.equal(data.sources['Amazon Music'],'not reported');
  assert.equal(data.commands,70);
  assert.equal((await fetch(url + '/api/status')).status,200);
  assert.equal(probes,1);
  assert.equal((await fetch(url + '/healthz')).status,200);
  assert.equal((await fetch(url + '/api/catalog').then(res=>res.json())).sources.length,12);
  assert.match(await fetch(url + '/').then(res=>res.text()), /Your sound/);
  assert.equal((await fetch(url + '/.env')).status,404);
});
