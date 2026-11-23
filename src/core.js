import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { searchProviders, sources } from './catalog.js';

export class UserError extends Error {}
export const requireThat = (condition, message) => {
  if (!condition) throw new UserError(message);
};
export const defaults = Object.freeze({ volume: 100, idle: 300, source: 'youtube', dj: null, announcements: false, channel: null });
export async function settingsFile(path) {
  let data = {};
  try {
    data = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let pending = Promise.resolve();
  return {
    get: id => ({ ...defaults, ...data[id] }),
    set(id, changes) {
      const save = pending.then(async () => {
        const next = { ...data };
        if (changes) next[id] = { ...next[id], ...changes };
        else delete next[id];
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
        await rename(path + '.tmp', path);
        data = next;
      });
      pending = save.catch(() => {});
      return save;
    },
  };
}

const matches = (hostname, domain) => hostname === domain || hostname.endsWith('.' + domain);
const serviceHosts = sources.flatMap(source => source.hosts ?? []);
export function identifier(query, source, directHosts) {
  const input = query.trim();
  requireThat(input, 'Enter a track title, artist or link.');
  const link = /^https?:\/\//i.test(input) ? URL.parse(input) : null;
  if (!link) {
    requireThat(!input.includes('://'), 'That link could not be read.');
    return searchProviders[source] + ':' + input;
  }
  requireThat(['http:', 'https:'].includes(link.protocol) && !link.username && !link.password,
    'Use an HTTP or HTTPS music link without embedded credentials.');
  const hostname = link.hostname.replace(/\.$/, '');
  const provider = serviceHosts.some(domain => matches(hostname, domain));
  requireThat((provider && !link.port) || directHosts.has(link.host.replace(/\.(?=:|$)/, '')),
    'That audio host is not configured. Ask the bot owner to add it to DIRECT_AUDIO_HOSTS.');
  return link.href;
}

export function loaded(result, preview = false) {
  requireThat(result, 'Lavalink did not return a result.');
  if (result.loadType === 'error') throw new UserError('Lavalink could not load this request. Check the link or try a different source.');
  if (result.loadType === 'track') return [result.data];
  if (result.loadType === 'playlist') return result.data.tracks;
  if (result.loadType === 'search') return result.data.slice(0, preview ? 5 : 1);
  return [];
}

export function duration(ms) {
  const seconds = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2,'0');
  return m < 60 ? m + ':' + s : Math.floor(m / 60) + ':' + String(m % 60).padStart(2,'0') + ':' + s;
}

const eq = values => ({ equalizer: values.map((gain, band) => ({ band, gain })) });
export const filters = {
  bassboost: eq([0.28,0.23,0.15,0.06]), trebleboost: { equalizer: [9,10,11,12,13,14].map(band => ({ band, gain: 0.15 })) },
  nightcore: { timescale: { speed: 1.22, pitch: 1.2 } }, vaporwave: { timescale: { speed: 0.82, pitch: 0.78 } },
  '8d': { rotation: { rotationHz: 0.18 } }, karaoke: { karaoke: { level: 0.85, monoLevel: 1, filterBand: 220, filterWidth: 100 } },
  tremolo: { tremolo: { frequency: 4, depth: 0.65 } }, vibrato: { vibrato: { frequency: 5, depth: 0.45 } },
  lowpass: { lowPass: { smoothing: 18 } }, mono: { channelMix: { leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: 0.5, rightToRight: 0.5 } },
  'left-only': { channelMix: { leftToLeft: 1, leftToRight: 0, rightToLeft: 0, rightToRight: 0 } },
  'right-only': { channelMix: { leftToLeft: 0, leftToRight: 0, rightToLeft: 0, rightToRight: 1 } },
  'filter-reset': {},
};
