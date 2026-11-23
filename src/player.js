import { randomUUID } from 'node:crypto';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { duration, requireThat } from './core.js';

export const title = track => (track.privateText ? 'Flowery TTS message' : String(track.info.title || 'Untitled').replace(/[\r\n]/g, ' ')).slice(0,120);
export const trackKey = track => JSON.stringify([track.info.sourceName, track.info.identifier]);

export class Players {
  sessions = new Map();
  locks = new Map();

  constructor(client, shoukaku, settings) {
    Object.assign(this, { client, shoukaku, settings });
  }

  run(id, action) {
    const result = (this.locks.get(id) ?? Promise.resolve()).then(action);
    const gate = result.catch(() => {});
    this.locks.set(id, gate);
    void gate.then(() => {
      if (this.locks.get(id) === gate) this.locks.delete(id);
    });
    return result;
  }

  event(id, action) {
    void this.run(id, action).catch(error => console.warn('Player event failed:', error.name));
  }

  async join(interaction, channel) {
    requireThat(this.shoukaku?.getIdealNode(), 'The Lavalink connection is unavailable.');
    requireThat(channel?.type === ChannelType.GuildVoice, 'Join a standard Discord voice channel first.');
    const permissions = channel.permissionsFor(interaction.guild.members.me);
    requireThat(permissions?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]),
      'Headnote needs Connect and Speak permissions in this voice channel.');
    const id = interaction.guildId;
    const previous = this.sessions.get(id);
    if (previous) return previous;
    const player = await this.shoukaku.joinVoiceChannel({
      guildId: id, channelId: channel.id, shardId: interaction.guild.shardId, deaf: true,
    });
    const session = { id, player, channelId: channel.id, textChannel: interaction.channelId, queue: [], history: [],
      loop: 'off', current: null, token: null, timer: null };
    this.sessions.set(id, session);
    this.armIdle(session);
    player.on('end', event => this.event(id, () => this.onEnd(session, event)));
    player.on('start', event => {
      if (this.isCurrent(session, event)) void this.announce(session, 'Now playing', title(session.current));
    });
    player.on('stuck', event => this.event(id, async () => {
      if (!this.isCurrent(session, event)) return;
      await session.player.stopTrack();
      await this.onEnd(session, { ...event, reason: 'loadFailed' });
    }));
    return session;
  }

  isCurrent(session, event) {
    return this.sessions.get(session.id) === session && session.current &&
      event.track?.userData?.headnote === session.token;
  }

  async leave(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    clearTimeout(session.timer);
    this.sessions.delete(id);
    await this.shoukaku.leaveVoiceChannel(id);
  }

  armIdle(session) {
    clearTimeout(session.timer);
    if (session.current) return;
    session.timer = setTimeout(() => this.event(session.id, async () => {
      if (this.sessions.get(session.id) === session && !session.current) await this.leave(session.id);
    }), this.settings.get(session.id).idle * 1000);
    session.timer.unref();
  }

  async announce(session, heading, description) {
    const conf = this.settings.get(session.id);
    if (!conf.announcements) return;
    try {
      const channel = await this.client.channels.fetch(conf.channel ?? session.textChannel);
      if (channel?.isSendable()) await channel.send({
        embeds: [{ title: heading, description, color: 0xaaff68 }], allowedMentions: { parse: [] },
      });
    } catch {
      // Playback can continue without text channel access.
    }
  }

  remember(session, track) {
    if (track) session.history = [track, ...session.history].slice(0,20);
  }

  async start(session, track) {
    const token = randomUUID();
    const old = { current: session.current, token: session.token };
    session.current = track;
    session.token = token;
    try {
      const volume = session.volume ?? this.settings.get(session.id).volume;
      await session.player.playTrack({ track: { encoded: track.encoded, userData: { headnote: token } }, position: 0, paused: false, volume });
      // The library updates position on WebSocket ticks, so reset it between tracks.
      session.player.position = 0;
      session.volume = volume;
      clearTimeout(session.timer);
    } catch (error) {
      Object.assign(session, old);
      this.armIdle(session);
      throw error;
    }
  }

  async advance(session, startAt = 0) {
    const old = session.current;
    const next = session.queue[startAt];
    if (next) {
      await this.start(session, next);
      session.queue.splice(0, startAt + 1);
    } else {
      session.current = null;
      session.token = null;
      this.armIdle(session);
    }
    this.remember(session, old);
    return next;
  }

  async onEnd(session, event) {
    if (!this.isCurrent(session, event) || event.reason === 'replaced') return;
    const ended = session.current;
    session.current = null;
    session.token = null;
    this.armIdle(session);
    if (event.reason === 'finished' && session.loop === 'track') {
      try {
        await this.start(session, ended);
      } catch {
        this.remember(session, ended);
        throw new Error('Could not repeat a finished track');
      }
      return;
    }
    this.remember(session, ended);
    if (event.reason === 'finished' && session.loop === 'queue' && session.queue.length < 500) session.queue.push(ended);
    if (event.reason === 'loadFailed') void this.announce(session, 'Could not play this track', title(ended));
    await this.advance(session);
  }

  now(session) {
    const item = session.current;
    const progress = item.info.isStream ? 'Live stream'
      : duration(session.player.position) + ' / ' + duration(item.info.length);
    return title(item) + '\n' + (session.player.paused ? 'Paused · ' : '') + progress;
  }
}
