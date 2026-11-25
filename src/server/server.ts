import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { clientMessageSchema, type ClientMessage, type ErrorCode, type ServerMessage } from '../shared/protocol';
import { RateLimiter } from './limits';
import { RoomError, RoomManager, type RoomData } from './rooms';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

export interface AppOptions {
  manager: RoomManager;
  staticDir?: string;
  allowedOrigins?: string[];
  trustProxy?: boolean;
  /** Header the host's edge sets to the visitor's address, e.g. `cf-connecting-ip`. Needs `trustProxy`. */
  ipHeader?: string;
  /** Override limits in tests. */
  limits?: { joinsPerMinute?: number; messagesPerSecond?: number; connectionsPerIp?: number };
}

interface Client {
  ws: WebSocket;
  ip: string;
  token: string | null;
  code: string | null;
  playerId: string | null;
  alive: boolean;
}

export interface App {
  http: Server;
  close(): Promise<void>;
}

function clientIp(req: IncomingMessage, trustProxy: boolean, ipHeader?: string): string {
  if (trustProxy) {
    const direct = ipHeader ? String(req.headers[ipHeader] ?? '').trim() : '';
    if (direct) return direct;
    // The right-most entry is the one our own proxy appended.
    const last = String(req.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function originAllowed(req: IncomingMessage, allowed: string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // Non-browser clients; they hold no ambient credentials.
  if (allowed.includes(origin)) return true;
  if (allowed.length) return false;
  try {
    const o = new URL(origin);
    const host = String(req.headers.host ?? '').replace(/:\d+$/, '');
    // Same hostname on another port is the Vite dev server.
    return o.hostname === host || (isLoopback(o.hostname) && isLoopback(host));
  } catch {
    return false;
  }
}
const isLoopback = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';

function serveStatic(root: string, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const base = resolve(root);
  let file = resolve(join(base, normalize(path)));
  if (path.includes('\0') || (file !== base && !file.startsWith(base + sep))) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(file)) {
      res.writeHead(404).end();
      return;
    }
    file = join(base, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Client is not built. Run: npm run build');
    return;
  }
  const immutable = path.startsWith('/assets/');
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

export function createApp(o: AppOptions): App {
  const { manager } = o;
  const clients = new Set<Client>();
  const joins = new RateLimiter(o.limits?.joinsPerMinute ?? 20, 60_000);
  const messages = new RateLimiter(o.limits?.messagesPerSecond ?? 20, 1_000);
  const maxConnections = o.limits?.connectionsPerIp ?? 40;

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: manager.size }));
      return;
    }
    if (o.staticDir) serveStatic(o.staticDir, req, res);
    else res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
  http.on('upgrade', (req, socket, head) => {
    const ip = clientIp(req, !!o.trustProxy, o.ipHeader);
    const path = (req.url ?? '').split('?')[0];
    const open = [...clients].filter((c) => c.ip === ip).length;
    if (path !== '/ws' || !originAllowed(req, o.allowedOrigins ?? []) || open >= maxConnections) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => connect(ws, ip));
  });

  const send = (c: Client, m: ServerMessage) => {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(m));
  };

  const inRoom = (room: RoomData) => [...clients].filter((c) => c.code === room.code && c.playerId);

  manager.events = {
    changed(room) {
      const view = manager.view(room);
      for (const c of inRoom(room)) send(c, { t: 'room', room: view, you: c.playerId! });
    },
    removed(room, playerId, reason) {
      for (const c of inRoom(room)) {
        if (c.playerId !== playerId) continue;
        c.code = c.playerId = null;
        send(c, { t: 'noRoom', reason });
      }
    },
  };

  const attach = (c: Client, room: RoomData, playerId: string) => {
    c.code = room.code;
    c.playerId = playerId;
    manager.setConnected(room, playerId, true);
    send(c, { t: 'room', room: manager.view(room), you: playerId });
  };

  function connect(ws: WebSocket, ip: string) {
    const c: Client = { ws, ip, token: null, code: null, playerId: null, alive: true };
    clients.add(c);
    ws.on('pong', () => (c.alive = true));
    ws.on('error', () => ws.terminate());
    ws.on('message', (data, isBinary) => {
      if (isBinary) return ws.close(1003);
      handle(c, String(data));
    });
    ws.on('close', () => {
      clients.delete(c);
      messages.forget(c);
      const room = c.code ? manager.find(c.code) : undefined;
      // A second tab of the same player keeps them online.
      if (room && c.playerId && ![...clients].some((x) => x.playerId === c.playerId)) manager.setConnected(room, c.playerId, false);
    });
  }

  function handle(c: Client, raw: string) {
    let rid = 0;
    const fail = (error: ErrorCode) => send(c, { t: 'ack', rid, ok: false, error });
    const allowed = messages.take(c);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return fail('badMessage');
    }
    if (json && typeof json === 'object' && 'rid' in json && typeof json.rid === 'number') rid = json.rid;
    // Checked after reading `rid` (payloads are capped at 8 KB) so the client can settle its pending request.
    if (!allowed) return fail('rateLimited');
    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) return fail('badMessage');
    try {
      dispatch(c, parsed.data);
    } catch (e) {
      if (e instanceof RoomError) return fail(e.code);
      console.error('unexpected error handling', parsed.data.t, e);
      fail('badMessage');
    }
  }

  function dispatch(c: Client, m: ClientMessage) {
    const ok = (extra: { token?: string; playerId?: string } = {}) => send(c, { t: 'ack', rid: m.rid, ok: true, ...extra });

    if (m.t === 'hello') {
      const found = m.token ? manager.session(m.token) : null;
      // Reuse a well-formed token so the same browser keeps one identity; otherwise mint one.
      c.token = m.token && /^[A-Za-z0-9_-]{32}$/.test(m.token) ? m.token : randomBytes(24).toString('base64url');
      ok({ token: c.token, playerId: found?.playerId });
      if (found) attach(c, found.room, found.playerId);
      else send(c, { t: 'noRoom', reason: 'none' });
      return;
    }
    if (!c.token) throw new RoomError('noSession');
    if (m.t === 'create' || m.t === 'join') {
      if (!joins.take(c.ip)) throw new RoomError('rateLimited');
      const r = m.t === 'create' ? manager.create(c.token, m.name, m.avatar, m.cityId) : manager.join(c.token, m.code, m.name, m.avatar);
      ok({ playerId: r.playerId });
      attach(c, r.room, r.playerId);
      return;
    }
    // Every other action is authorised against the seat owned by this session, never against client-sent ids.
    const seat = manager.session(c.token);
    if (!seat) throw new RoomError('noSession');
    const { room, playerId } = seat;
    switch (m.t) {
      case 'leave': manager.leave(room, playerId); break;
      case 'ready': manager.setReady(room, playerId, m.ready); break;
      case 'config': manager.configure(room, playerId, m.cityId, m.settings); break;
      case 'kick': manager.kick(room, playerId, m.playerId); break;
      case 'start': manager.start(room, playerId); break;
      case 'build': manager.build(room, playerId, m.turn, m.from, m.edge); break;
      case 'pass': manager.pass(room, playerId, m.turn); break;
      case 'skip': manager.skip(room, playerId, m.playerId, m.turn); break;
      case 'continue': manager.continue(room, playerId, m.round, m.force ?? false); break;
      case 'pause': manager.pause(room, playerId, m.paused); break;
      case 'restart': manager.restart(room, playerId); break;
      case 'rematch': manager.rematch(room, playerId); break;
    }
    ok();
  }

  const sweep = setInterval(() => manager.sweep(), 1000);
  const heartbeat = setInterval(() => {
    joins.prune();
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 15_000);

  return {
    http,
    close() {
      clearInterval(sweep);
      clearInterval(heartbeat);
      for (const c of clients) c.ws.terminate();
      wss.close();
      return new Promise((done) => {
        http.close(() => done());
        http.closeAllConnections();
      });
    },
  };
}
