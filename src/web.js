import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { catalog, sources } from './catalog.js';

export function statusReader({ client, configured, discordConfigured, nodeUrl, password, shoukaku, players }) {
  let result;
  let expiry = 0;
  let inFlight;
  async function inspect() {
    if (!configured) return { state: 'unconfigured', managers: [] };
    const start = performance.now();
    try {
      const response = await fetch(new URL('/v4/info', nodeUrl), {
        headers: { Authorization: password }, redirect: 'error', signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) {
        return { state: [401,403].includes(response.status) ? 'authentication failed' : 'unavailable', managers: [] };
      }
      const data = await response.json();
      if (!Array.isArray(data.sourceManagers)) return { state: 'unavailable', managers: [] };
      return {
        state: 'reachable', version: String(data.version?.semver ?? '').slice(0,32),
        latencyMs: Math.round(performance.now() - start),
        managers: data.sourceManagers.map(value => String(value).toLowerCase()),
      };
    } catch {
      return { state: 'unreachable', managers: [] };
    }
  }
  return async () => {
    if (Date.now() >= expiry) {
      inFlight ??= inspect().then(node => {
        result = { ...node, checkedAt: new Date().toISOString() };
        expiry = Date.now() + 15_000;
        inFlight = undefined;
      });
      await inFlight;
    }
    const { managers, ...node } = result;
    const connected = client.isReady();
    return {
      api: 'online',
      discord: { state: connected ? 'connected' : discordConfigured ? 'disconnected' : 'unconfigured',
        latencyMs: connected && client.ws.ping >= 0 ? client.ws.ping : null },
      lavalink: { ...node, gateway: !configured ? 'unconfigured' : shoukaku?.getIdealNode()?.sessionId ? 'connected' : 'disconnected' },
      commands: catalog.categories.reduce((total, category) => total + category.commands.length, 0),
      activeSessions: players.sessions.size,
      sources: Object.fromEntries(sources.map(source => [source.name, node.state !== 'reachable' ? 'unknown'
        : source.managers.some(manager => managers.includes(manager)) ? 'reported' : 'not reported'])),
    };
  };
}

const files = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/style.css', ['style.css','text/css; charset=utf-8']],
  ['/app.js', ['app.js','text/javascript; charset=utf-8']],
  ['/icon.svg', ['icon.svg','image/svg+xml']],
].map(([path, [file, type]]) => [path, { type, bytes: readFileSync(new URL('../public/' + file, import.meta.url)) }]));

export function serverFor(getStatus, getInvite) {
  return createServer(async (request, response) => {
    const path = request.url.split('?')[0];
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (code, type, body) => {
      response.writeHead(code, { 'Content-Type': type });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const json = (code, data) => {
      response.setHeader('Cache-Control','no-store');
      send(code,'application/json; charset=utf-8',JSON.stringify(data));
    };
    if (!['GET','HEAD'].includes(request.method)) {
      response.setHeader('Allow','GET, HEAD');
      return json(405, { error: 'Method not allowed' });
    }
    try {
      if (path === '/healthz') return json(200, { ok: true });
      if (path === '/api/status') return json(200, await getStatus());
      if (path === '/api/catalog') return json(200, { ...catalog, invite: getInvite() });
      const file = files.get(path);
      if (file) return send(200, file.type, file.bytes);
      return json(404, { error: 'Page not found' });
    } catch {
      return json(500, { error: 'Status is temporarily unavailable' });
    }
  });
}
