import { PermissionFlagsBits } from 'discord.js';
import { catalog } from './catalog.js';
import { defaults, duration, filters, identifier, loaded, requireThat } from './core.js';
import { title, trackKey } from './player.js';

const additions = new Set(['play','queue-add','play-next','tts']);
const readQueue = new Set(['queue','queue-size','queue-history']);
const link = id => 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
  client_id: id, scope: 'bot applications.commands', permissions: '3165184',
});
export const invite = link;
const clean = text => text.replace(/[\\*_~`|<>]/g, '\\$&');
const name = track => clean(title(track));
const formatList = (tracks, start = 0) => tracks.map((track, index) =>
  (index + start + 1) + '. ' + name(track) + (track.info.isStream ? ' · Live' : ' · ' + duration(track.info.length))).join('\n');
const report = data => 'Website API: **' + data.api + '**\nDiscord bot: **' + data.discord.state +
  '**\nLavalink REST: **' + data.lavalink.state + '**\nLavalink WebSocket: **' + data.lavalink.gateway + '**';

export function createActions({ client, players, settings, getStatus, publicUrl, directHosts }) {
  const info = {
    help: () => catalog.categories.map(group =>
      '**' + group.name + ' · ' + group.commands.length + '**\n' + group.commands.map(command => '`/' + command.name + '`').join(' ')).join('\n\n'),
    about: () => 'Headnote plays music in Discord through a personal Lavalink node. Use `/play` to get started.',
    ping: () => client.ws.ping < 0 ? 'Discord gateway latency is unavailable.' : 'Discord gateway: **' + client.ws.ping + ' ms**',
    uptime: () => 'Connected for **' + duration(client.uptime) + '** (h:mm:ss or m:ss).',
    status: () => getStatus().then(report),
    sources: () => catalog.sources.map(source => '**' + source.name + '** · ' + source.note).join('\n'),
    node: async () => {
      const data = (await getStatus()).lavalink;
      return 'REST: **' + data.state + '** · WebSocket: **' + data.gateway + '**' +
        (data.version ? '\nLavalink **' + data.version + '** · REST latency **' + data.latencyMs + ' ms**' : '');
    },
    botinfo: () => '**Headnote** · ' + client.guilds.cache.size + ' Discord servers · ' + players.sessions.size + ' voice sessions',
    invite: () => link(client.user.id),
    website: () => publicUrl || 'The Headnote website URL has not been configured by the bot owner.',
  };

  return async (command, i) => {
    const { name: action, category } = command;
    const id = i.guildId;
    const o = i.options;
    if (category === 'Info') return info[action]();
    return players.run(id, async () => {
      const conf = settings.get(id);
      const manage = i.memberPermissions.has(PermissionFlagsBits.ManageGuild);
      const session = players.sessions.get(id);
      const member = i.guild.members.cache.get(i.user.id) ?? await i.guild.members.fetch(i.user.id);
      const channel = member.voice.channel;
      const inSessionChannel = !!channel && (!session || channel.id === session.channelId);

      if (category === 'Config') {
        if (action === 'config-show') return [
          'Default volume: **' + conf.volume + '%**', 'Idle timeout: **' + conf.idle + ' seconds**',
          'Default search: **' + conf.source + '**', 'DJ role: ' + (conf.dj ? '<@&' + conf.dj + '>' : 'Open controls'),
          'Announcements: **' + (conf.announcements ? 'On' : 'Off') + '**',
          'Announcement channel: ' + (conf.channel ? '<#' + conf.channel + '>' : 'Request channel'),
        ].join('\n');
        requireThat(manage, 'You need Manage Server to change Headnote settings.');
        const changes = {
          'config-volume': () => ({ volume: o.getInteger('percent') }),
          'config-dj': () => {
            const role = o.getRole('role');
            requireThat(role.id !== id && !role.managed, 'Choose a regular server role.');
            return { dj: role.id };
          },
          'config-dj-clear': () => ({ dj: null }), 'config-idle': () => ({ idle: o.getInteger('seconds') }),
          'config-source': () => ({ source: o.getString('source') }),
          'config-announcements': () => ({ announcements: o.getBoolean('enabled') }),
          'config-channel': () => ({ channel: o.getChannel('channel').id }),
          'config-channel-clear': () => ({ channel: defaults.channel }), 'config-reset': () => null,
        };
        await settings.set(id, changes[action]());
        if (session && ['config-idle','config-reset'].includes(action)) players.armIdle(session);
        return action === 'config-reset' ? 'Default settings restored.' : 'Server settings saved.';
      }

      const resolve = async (flowery = false, preview = false) => {
        const node = players.shoukaku?.getIdealNode();
        requireThat(node, 'The Lavalink connection is unavailable.');
        const input = flowery ? 'ftts://' + encodeURIComponent(o.getString('text'))
          : identifier(o.getString('query'), o.getString('source') ?? conf.source, directHosts);
        const items = loaded(await node.rest.resolve(input), preview);
        requireThat(items.length, 'No tracks matched your request.');
        return items.slice(0, preview ? 5 : 501).map(track => ({
          ...track, requester: i.user.id, privateText: flowery,
        }));
      };

      if (action === 'search') return formatList(await resolve(false, true));
      if (category === 'Song') {
        requireThat(session?.current, 'Nothing is playing on this server.');
        const item = session.current;
        const track = item.info;
        if (action === 'nowplaying') return players.now(session);
        if (action === 'song-requester') return 'Requested by <@' + item.requester + '>.';
        if (action === 'song-link') {
          const url = URL.parse(track.uri ?? '');
          requireThat(!item.privateText && url && ['https:','http:'].includes(url.protocol) && !url.username && !url.password,
            'This track has no shareable link.');
          requireThat(String(track.sourceName).toLowerCase() !== 'http' || item.requester === i.user.id || manage,
            'The requester can retrieve the original direct audio link.');
          return '<' + url.href + '>';
        }
        return '**' + name(item) + '**\nArtist: ' + (item.privateText ? 'Flowery TTS' : clean(String(track.author || 'Unknown').slice(0,150))) +
          '\nSource: ' + clean(String(track.sourceName ?? 'Unknown')) + '\nLength: ' + (track.isStream ? 'Live' : duration(track.length));
      }

      if (readQueue.has(action)) {
        requireThat(session, 'There is no active queue on this server.');
        const queue = session.queue;
        if (action === 'queue-history') return session.history.length ? formatList(session.history.slice(0,10)) : 'Playback history is empty.';
        if (action === 'queue-size') return '**' + queue.length + '** upcoming · **' +
          duration(queue.reduce((sum, track) => sum + (track.info.isStream ? 0 : track.info.length),0)) + '** of timed audio · **' +
          queue.filter(track => track.info.isStream).length + '** live';
        if (!queue.length) return 'The upcoming queue is empty.';
        const page = o.getInteger('page') ?? 1;
        const pages = Math.ceil(queue.length / 10);
        requireThat(page <= pages, 'This queue has only ' + pages + ' page(s).');
        return 'Page **' + page + '/' + pages + '**\n' + formatList(queue.slice((page - 1) * 10, page * 10), (page - 1) * 10);
      }

      requireThat(inSessionChannel || (manage && action === 'leave' && session),
        session ? 'Join Headnote’s voice channel to use this command.' : 'Join a voice channel first.');
      const dj = conf.dj && i.guild.roles.cache.has(conf.dj);
      if (dj && !manage && !member.roles.cache.has(conf.dj)) {
        requireThat(['play','queue-add','join','tts'].includes(action), 'Only DJs and server managers can change playback and queue order.');
      }
      if (action === 'join') {
        await players.join(i, channel);
        return 'Connected to <#' + channel.id + '>.';
      }
      if (additions.has(action)) {
        const tracks = await resolve(action === 'tts');
        const active = await players.join(i, channel);
        active.textChannel = i.channelId;
        const available = 500 - active.queue.length + (active.current ? 0 : 1);
        requireThat(available > 0, 'The upcoming queue is full.');
        const selected = tracks.slice(0, available);
        const add = action === 'play-next' ? [...selected, ...active.queue] : [...active.queue, ...selected];
        const starts = !active.current;
        if (starts) await players.start(active, add.shift());
        active.queue = add;
        const detail = selected.length === 1 ? name(selected[0]) : selected.length + ' tracks';
        return (starts ? 'Accepted for playback: ' : action === 'play-next' ? 'Added to the front: ' : 'Queued: ') +
          '**' + detail + '**.' + (tracks.length > selected.length ? ' The queue reached its 500-track limit.' : '');
      }
      requireThat(session, 'Start playback with `/play` first.');
      const player = session.player;
      const queue = session.queue;
      const current = () => {
        requireThat(session.current, 'Nothing is playing.');
        return session.current;
      };
      const index = key => {
        const value = o.getInteger(key);
        requireThat(value <= queue.length, 'There is no upcoming track at position ' + value + '.');
        return value - 1;
      };
      const seek = async target => {
        const info = current().info;
        requireThat(info.isSeekable && !info.isStream && info.length > 0, 'This audio cannot be seeked.');
        const next = Math.max(0, Math.min(target, info.length - 1));
        await player.update({ position: next, paused: player.paused });
        player.position = next;
        return 'Moved to **' + duration(next) + '**.';
      };
      if (category === 'Filters') {
        const multiplier = o.getNumber('multiplier');
        const filter = filters[action] ?? { timescale: { [action]: multiplier } };
        await player.update({ filters: filter, paused: player.paused });
        return action === 'filter-reset' ? 'Audio filters cleared.' : 'Applied **' + action + '**.';
      }
      switch (action) {
        case 'leave':
          await players.leave(id);
          return 'Disconnected and cleared this playback session.';
        case 'pause':
        case 'resume':
          current();
          await player.setPaused(action === 'pause');
          return action === 'pause' ? 'Playback paused.' : 'Playback resumed.';
        case 'stop': {
          const item = current();
          await player.stopTrack();
          players.remember(session, item);
          session.current = null;
          session.token = null;
          players.armIdle(session);
          return 'Playback stopped. Upcoming tracks stay in the queue until the idle timeout. Use `/skip` to continue.';
        }
        case 'skip': {
          const item = session.current;
          requireThat(item || queue.length, 'There are no tracks to skip.');
          if (item && !queue.length) await player.stopTrack();
          const next = await players.advance(session);
          return next ? 'Skipped to **' + name(next) + '**.' : 'Skipped the final track.';
        }
        case 'previous': {
          const prior = session.history[0];
          requireThat(prior, 'There is no previously played track.');
          const item = session.current;
          if (item) requireThat(queue.length < 500, 'Remove an upcoming track before going back.');
          await players.start(session, prior);
          session.history.shift();
          if (item) queue.unshift(item);
          return 'Playing **' + name(prior) + '** again.';
        }
        case 'seek': return seek(o.getInteger('seconds') * 1000);
        case 'forward': return seek(player.position + o.getInteger('seconds') * 1000);
        case 'rewind': return seek(player.position - o.getInteger('seconds') * 1000);
        case 'restart': return seek(0);
        case 'volume':
          await player.update({ volume: o.getInteger('percent'), paused: player.paused });
          session.volume = o.getInteger('percent');
          return 'Session volume set to **' + session.volume + '%**.';
        case 'loop':
          session.loop = o.getString('mode');
          return 'Loop mode set to **' + session.loop + '**.';
        case 'queue-remove':
          return 'Removed **' + name(queue.splice(index('position'), 1)[0]) + '**.';
        case 'queue-move': {
          const from = index('from');
          const to = index('to');
          queue.splice(to, 0, queue.splice(from, 1)[0]);
          return 'Moved track ' + (from + 1) + ' to position ' + (to + 1) + '.';
        }
        case 'queue-swap': {
          const first = index('first');
          const second = index('second');
          [queue[first], queue[second]] = [queue[second], queue[first]];
          return 'Swapped tracks ' + (first + 1) + ' and ' + (second + 1) + '.';
        }
        case 'queue-shuffle':
          for (let end = queue.length - 1; end > 0; end--) {
            const pick = Math.floor(Math.random() * (end + 1));
            [queue[end], queue[pick]] = [queue[pick], queue[end]];
          }
          return 'Shuffled **' + queue.length + '** upcoming tracks.';
        case 'queue-clear':
          return 'Cleared **' + queue.splice(0).length + '** upcoming tracks.';
        case 'queue-jump': {
          const next = await players.advance(session, index('position'));
          return 'Jumped to **' + name(next) + '**.';
        }
        case 'queue-dedupe': {
          const seen = new Set();
          session.queue = queue.filter(track => {
            const key = trackKey(track);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return 'Removed **' + (queue.length - session.queue.length) + '** duplicate tracks.';
        }
        case 'queue-reverse':
          queue.reverse();
          return 'Reversed the upcoming queue.';
        case 'queue-remove-range': {
          const first = index('first');
          const last = index('last');
          requireThat(first <= last, 'The first position must be before or equal to the last position.');
          return 'Removed **' + queue.splice(first, last - first + 1).length + '** tracks.';
        }
        case 'queue-remove-user':
          session.queue = queue.filter(track => track.requester !== o.getUser('member').id);
          return 'Removed **' + (queue.length - session.queue.length) + '** tracks requested by that member.';
        default:
          throw new Error('No handler for ' + action);
      }
    });
  };
}
