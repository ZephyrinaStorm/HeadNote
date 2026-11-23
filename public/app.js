'use strict';

const byId = id => document.getElementById(id);
const create = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const pattern = [5,10,6,16,23,11,31,25,50,42,64,52,81,67,97,73,38,62,83,62,36,49,75,99,68,82,52,40,61,32,47,27,38,18,29,12,20,9,13,4];
for (const height of pattern) {
  const bar = create('i');
  bar.style.height = height + '%';
  byId('wave').append(bar);
}
let catalog;
let status;
let refreshing = false;

async function read(path) {
  const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}
function renderSources() {
  if (!catalog) return;
  byId('source-list').replaceChildren(...catalog.sources.map(source => {
    const item = create('article');
    const mark = /^[a-z]$/i.test(source.mark) ? source.mark : source.name[0];
    const icon = create('span', mark, 'source-icon ' + source.color);
    icon.setAttribute('aria-hidden','true');
    const content = create('div');
    content.append(create('h3', source.name), create('p', source.note));
    const state = status?.sources[source.name];
    if (state && state !== 'unknown') {
      content.append(create('small', state === 'reported' ? 'Manager reported by node' : 'Manager not listed by node'));
    }
    item.append(icon, content);
    return item;
  }));
}
function renderCommands() {
  if (!catalog) return;
  const term = byId('command-search').value.toLowerCase().trim().replace(/^\//,'');
  const visible = catalog.categories.flatMap((group, index) => {
    const matches = group.commands.filter(command =>
      (command.name + ' ' + command.description + ' ' + group.name).toLowerCase().includes(term));
    if (!matches.length) return [];
    const item = create('details');
    item.open = Boolean(term) || index === 0;
    const list = create('ul');
    for (const command of matches) {
      const entry = create('li');
      entry.append(create('code', '/' + command.name), create('span', command.description));
      list.append(entry);
    }
    item.append(create('summary', group.name + ' (' + matches.length + ')'), list);
    return [item];
  });
  byId('command-list').replaceChildren(...(visible.length ? visible : [create('p','No matching commands.')]));
}

function renderOverview(data) {
  const discord = data?.discord.state ?? 'unknown';
  const node = data?.lavalink.gateway ?? 'unknown';
  const bothConnected = discord === 'connected' && node === 'connected';
  const overview = byId('overview-state');
  overview.className = 'pill' + (bothConnected ? ' good' : data ? '' : ' bad');
  overview.textContent = bothConnected ? 'Connected' : data ? 'See details' : 'API unavailable';
  byId('overview-discord').textContent = statusLabel(discord);
  byId('overview-node').textContent = statusLabel(node);
}

const statusLabel = value => value[0].toUpperCase() + value.slice(1);
function state(id, value) {
  const element = byId(id);
  element.className = 'state' + (['online','connected','reachable'].includes(value) ? ' good' :
    ['unreachable','unavailable','authentication failed','disconnected'].includes(value) ? ' bad' : '');
  element.textContent = statusLabel(value);
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  byId('refresh').disabled = true;
  try {
    status = await read('/api/status');
    state('api',status.api);
    state('discord',status.discord.state);
    state('lavalink',status.lavalink.state);
    state('gateway',status.lavalink.gateway);
    byId('discord-detail').textContent = status.discord.latencyMs === null ? 'Discord gateway' : status.discord.latencyMs + ' ms gateway latency';
    byId('node-detail').textContent = status.lavalink.version ?
      'v' + status.lavalink.version + ' · ' + status.lavalink.latencyMs + ' ms REST response' : 'Audio node API';
    byId('checked').textContent = 'Node checked ' + new Date(status.lavalink.checkedAt).toLocaleTimeString() + ' · Refreshes every 30 seconds';
  } catch {
    status = null;
    state('api','unreachable');
    for (const id of ['discord','lavalink','gateway']) state(id,'unknown');
    byId('node-detail').textContent = 'Audio node API';
    byId('discord-detail').textContent = 'Discord gateway';
    byId('checked').textContent = 'Could not fetch status. Try refreshing.';
  } finally {
    refreshing = false;
    byId('refresh').disabled = false;
    renderOverview(status);
    renderSources();
  }
}
byId('command-search').addEventListener('input', renderCommands);
byId('refresh').addEventListener('click', refresh);
void read('/api/catalog').then(data => {
  catalog = data;
  if (data.invite) {
    for (const element of document.querySelectorAll('.invite')) {
      element.href = data.invite;
      element.firstChild.textContent = 'Add to Discord ';
    }
  }
  renderSources();
  renderCommands();
}).catch(() => {
  byId('source-list').replaceChildren(create('p','Could not load audio sources. Reload to try again.'));
  byId('command-list').replaceChildren(create('p','Could not load commands. Reload to try again.'));
});
void refresh();
setInterval(refresh, 30_000);
