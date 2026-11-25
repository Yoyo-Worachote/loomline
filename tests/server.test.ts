import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { getCity } from '../src/cities';
import { playerLegalMoves, turnKey } from '../src/engine/game';
import { RateLimiter } from '../src/server/limits';
import { RoomManager, type RoomData } from '../src/server/rooms';
import { createApp, type App, type AppOptions } from '../src/server/server';
import { FileStore, MemoryStore } from '../src/server/store';
import type { ClientBody, RoomView, ServerMessage } from '../src/shared/protocol';

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

type Ack = Extract<ServerMessage, { t: 'ack' }>;

class TestClient {
  ws!: WebSocket;
  room: RoomView | null = null;
  you = '';
  token?: string;
  noRoom: string | null = null;
  private rid = 0;
  private acks = new Map<number, (a: Ack) => void>();
  constructor(readonly port: number) {}

  async open(token?: string, headers: Record<string, string> = {}) {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`, { headers });
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMessage;
      if (m.t === 'room') {
        this.room = m.room;
        this.you = m.you;
        this.noRoom = null;
      } else if (m.t === 'noRoom') {
        this.room = null;
        this.noRoom = m.reason;
      } else {
        this.acks.get(m.rid)?.(m);
        this.acks.delete(m.rid);
      }
    });
    await new Promise<void>((ok, no) => {
      this.ws.once('open', () => ok());
      this.ws.once('error', no);
    });
    cleanups.push(() => this.ws.terminate());
    const a = await this.send({ t: 'hello', token });
    if (a.ok) this.token = a.token;
    return this;
  }
  raw(text: string): Promise<Ack> {
    return new Promise((ok) => {
      const rid = (JSON.parse(text) as { rid: number }).rid;
      this.acks.set(rid, ok);
      this.ws.send(text);
    });
  }
  send(body: ClientBody): Promise<Ack> {
    const rid = ++this.rid;
    return new Promise((ok) => {
      this.acks.set(rid, ok);
      this.ws.send(JSON.stringify({ rid, ...body }));
    });
  }
  async err(body: ClientBody) {
    const a = await this.send(body);
    return a.ok ? 'ok' : a.error;
  }
  async until(check: (r: RoomView) => boolean) {
    for (let i = 0; i < 200; i++) {
      if (this.room && check(this.room)) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('condition not reached');
  }
  close() {
    return new Promise<void>((ok) => {
      this.ws.once('close', () => ok());
      this.ws.close();
    });
  }
}

async function server(opts: Partial<AppOptions> & { manager?: RoomManager } = {}) {
  const manager = opts.manager ?? new RoomManager({ store: new MemoryStore(), seed: () => 'fixed-seed' });
  const app: App = createApp({ limits: { joinsPerMinute: 100, messagesPerSecond: 500 }, ...opts, manager });
  await new Promise<void>((r) => app.http.listen(0, '127.0.0.1', r));
  cleanups.push(() => app.close());
  return { manager, port: (app.http.address() as AddressInfo).port, app };
}

async function twoPlayers() {
  const s = await server();
  const a = await new TestClient(s.port).open();
  await a.send({ t: 'create', name: 'มะลิ', avatar: 0, cityId: 'london' });
  const b = await new TestClient(s.port).open();
  await b.send({ t: 'join', code: a.room!.code.toLowerCase(), name: 'Bo', avatar: 1 });
  await a.until((r) => r.players.length === 2);
  return { ...s, a, b };
}

async function started() {
  const s = await twoPlayers();
  await s.b.send({ t: 'ready', ready: true });
  await s.a.send({ t: 'start' });
  await s.b.until((r) => r.phase === 'playing');
  const room = s.manager.find(s.a.room!.code)!;
  return { ...s, data: room, game: () => room.game!, city: getCity('london')! };
}

/** A legal build message for this player, straight from the server state. */
function move(data: RoomData, id: string): ClientBody {
  const m = playerLegalMoves(data.game!, getCity(data.cityId)!, id)[0]!;
  return { t: 'build', turn: turnKey(data.game!, id), from: m.from, edge: m.edge };
}

describe('lobby', () => {
  it('creates and joins a private room, with presence and host role', async () => {
    const { a, b } = await twoPlayers();
    expect(a.room!.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(a.room!.hostId).toBe(a.you);
    expect(b.room!.players.map((p) => p.name)).toEqual(['มะลิ', 'Bo']);
    expect(b.room!.players.every((p) => p.connected)).toBe(true);
  });

  it('rejects unknown rooms, duplicate names, full rooms and double membership', async () => {
    const { port, a } = await twoPlayers();
    const code = a.room!.code;
    const c = await new TestClient(port).open();
    expect(await c.err({ t: 'join', code: 'ZZZZZZ', name: 'X', avatar: 0 })).toBe('roomNotFound');
    expect(await c.err({ t: 'join', code, name: 'bo', avatar: 0 })).toBe('nameTaken');
    expect(await c.err({ t: 'join', code, name: 'C', avatar: 0 })).toBe('ok');
    const d = await new TestClient(port).open();
    expect(await d.err({ t: 'join', code, name: 'D', avatar: 0 })).toBe('ok');
    const e = await new TestClient(port).open();
    expect(await e.err({ t: 'join', code, name: 'E', avatar: 0 })).toBe('roomFull');
    expect(await a.err({ t: 'create', name: 'A', avatar: 0, cityId: 'london' })).toBe('alreadyInRoom');
  });

  it('restricts host actions and requires everyone to be ready', async () => {
    const { a, b } = await twoPlayers();
    const settings = { modules: ['objectives' as const], turnSeconds: 45 as const, autoPass: true };
    expect(await b.err({ t: 'config', cityId: 'tokyo', settings })).toBe('notHost');
    expect(await b.err({ t: 'start' })).toBe('notHost');
    expect(await b.err({ t: 'kick', playerId: a.you })).toBe('notHost');
    expect(await a.err({ t: 'start' })).toBe('notAllReady');
    expect(await a.err({ t: 'config', cityId: 'atlantis', settings })).toBe('unknownCity');
    await b.send({ t: 'ready', ready: true });
    expect(await a.err({ t: 'config', cityId: 'tokyo', settings })).toBe('ok');
    await b.until((r) => r.cityId === 'tokyo' && !r.players[1]!.ready); // changing the game un-readies guests
    expect(b.room!.settings).toEqual(settings);
  });

  it('lets the host kick, and hands the host role over when the host leaves', async () => {
    const { a, b, port } = await twoPlayers();
    const code = a.room!.code;
    const c = await new TestClient(port).open();
    await c.send({ t: 'join', code, name: 'C', avatar: 2 });
    await a.send({ t: 'kick', playerId: c.you });
    await a.until((r) => r.players.length === 2);
    expect(c.noRoom).toBe('kicked');
    await a.send({ t: 'leave' });
    await b.until((r) => r.hostId === b.you && r.players.length === 1);
    expect(a.noRoom).toBe('left');
  });

  it('cleans names and rejects invisible ones', async () => {
    const { port } = await server();
    const c = await new TestClient(port).open();
    const zeroWidth = String.fromCharCode(0x200b, 0x202e);
    expect(await c.err({ t: 'create', name: zeroWidth, avatar: 0, cityId: 'london' })).toBe('badMessage');
    await c.send({ t: 'create', name: `  A${zeroWidth}b   c `, avatar: 0, cityId: 'london' });
    expect(c.room!.players[0]!.name).toBe('Ab c');
  });
});

describe('game synchronisation', () => {
  it('shows every player the same card and hides the seed and undrawn deck', async () => {
    const { a, b } = await started();
    await a.until((r) => r.phase === 'playing');
    expect(a.room!.game!.revealed).toEqual(b.room!.game!.revealed);
    expect(a.room!.game!.revealed).toHaveLength(1);
    const wire = JSON.stringify(a.room);
    expect(wire).not.toContain('fixed-seed');
    expect(wire).not.toContain('tokenHash');
    expect(a.room!.game).not.toHaveProperty('deck');
    expect(a.room!.game).not.toHaveProperty('log');
  });

  it('syncs a move, waits for both players, then reveals the next card to both', async () => {
    const { a, b, data } = await started();
    await a.send(move(data, a.you));
    await b.until((r) => r.game!.players[a.you]!.segments.length === 1);
    expect(b.room!.game!.revealed).toHaveLength(1);
    await b.send({ t: 'pass', turn: turnKey(data.game!, b.you) });
    await a.until((r) => r.game!.revealed.length >= 2);
    await b.until((r) => r.game!.revealed.length >= 2);
    expect(a.room!.game!.revealed).toEqual(b.room!.game!.revealed);
  });

  it('rejects duplicates, stale turns, illegal edges and other seats', async () => {
    const { a, b, data } = await started();
    const m = move(data, a.you);
    const both = await Promise.all([a.send(m), a.send(m)]);
    expect(both.filter((x) => x.ok)).toHaveLength(1);
    expect(data.game!.players[a.you]!.segments).toHaveLength(1);
    expect(await b.err({ t: 'build', turn: '9.9.1', from: 'b2', edge: 'b2-b3' })).toBe('staleTurn');
    const turn = turnKey(data.game!, b.you);
    expect(await b.err({ t: 'build', turn, from: 'b2', edge: 'nope' })).toBe('noEdge');
    // A client cannot name another player: unknown keys are ignored and the session's own seat is used.
    const sneaky = { rid: 9001, t: 'pass', turn, playerId: a.you };
    await b.raw(JSON.stringify(sneaky));
    expect(data.game!.players[b.you]!.segments).toHaveLength(0);
    expect(data.game!.log.at(-1)).toMatchObject({ type: 'pass', playerId: b.you });
  });

  it('survives simultaneous submissions from both players', async () => {
    const { a, b, data } = await started();
    const acks = await Promise.all([a.send(move(data, a.you)), b.send(move(data, b.you))]);
    expect(acks.every((x) => x.ok)).toBe(true);
    expect(data.game!.reveal).toBeGreaterThanOrEqual(1);
  });

  it('blocks joining mid-game and restores state on reconnect', async () => {
    const { a, b, data, port } = await started();
    await b.send(move(data, b.you));
    const token = b.token;
    await b.close();
    await a.until((r) => r.players.some((p) => !p.connected));
    const late = await new TestClient(port).open();
    expect(await late.err({ t: 'join', code: data.code, name: 'Late', avatar: 0 })).toBe('gameInProgress');
    const back = await new TestClient(port).open(token);
    await back.until((r) => r.phase === 'playing');
    expect(back.you).toBe(b.you);
    expect(back.room!.game!.players[b.you]!.segments).toHaveLength(1);
    expect(back.room!.game!.players[b.you]!.status).toBe('built');
    await a.until((r) => r.players.every((p) => p.connected));
  });

  it('keeps a player online while a second tab is open', async () => {
    const { a, b, port } = await started();
    const tab = await new TestClient(port).open(b.token);
    await b.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(a.room!.players.every((p) => p.connected)).toBe(true);
    expect(tab.you).toBe(b.you);
  });

  it('lets the host skip only disconnected players', async () => {
    const { a, b, data } = await started();
    const turn = turnKey(data.game!, b.you);
    expect(await a.err({ t: 'skip', playerId: b.you, turn })).toBe('unknownPlayer');
    await b.close();
    await a.until((r) => !r.players.find((p) => p.id === b.you)!.connected);
    expect(await a.err({ t: 'skip', playerId: b.you, turn })).toBe('ok');
    expect(data.game!.players[b.you]!.status).toBe('skipped');
  });

  it('pauses, resumes and restarts under host control', async () => {
    const { a, b, data } = await started();
    expect(await b.err({ t: 'pause', paused: true })).toBe('notHost');
    await a.send({ t: 'pause', paused: true });
    expect(await b.err(move(data, b.you))).toBe('paused');
    await a.send({ t: 'pause', paused: false });
    expect(await b.err(move(data, b.you))).toBe('ok');
    expect(await b.err({ t: 'restart', confirm: true })).toBe('notHost');
    await a.send({ t: 'restart', confirm: true });
    await b.until((r) => r.phase === 'lobby' && r.game === null);
  });

  it('continues when a player leaves mid-game and passes on the host role', async () => {
    const { a, b, data } = await started();
    await b.send(move(data, b.you));
    await a.send({ t: 'leave' });
    await b.until((r) => r.hostId === b.you);
    expect(b.room!.players.find((p) => p.id === a.you)!.left).toBe(true);
    expect(data.game!.players[a.you]!.retired).toBe(true);
    expect(data.game!.reveal).toBeGreaterThanOrEqual(1);
  });

  it('plays a whole game over sockets, then rematches with clean state', async () => {
    const { a, b, data } = await started();
    for (let i = 0; i < 400 && data.game!.phase !== 'finished'; i++) {
      const g = data.game!;
      if (g.phase === 'roundScoring') {
        await a.send({ t: 'continue', round: g.round });
        expect(data.game!.phase).toBe('roundScoring'); // waits for both
        await b.send({ t: 'continue', round: g.round });
        continue;
      }
      for (const c of [a, b]) if (data.game!.phase === 'playing' && data.game!.players[c.you]!.status === 'deciding') await c.send(move(data, c.you));
    }
    await a.until((r) => r.phase === 'finished');
    await b.until((r) => r.phase === 'finished');
    expect(a.room!.game!.ranking).toHaveLength(2);
    expect(a.room!.game!.seed).toBe('fixed-seed');
    expect(a.room!.history).toHaveLength(1);
    expect(await b.err({ t: 'rematch' })).toBe('notHost');
    await a.send({ t: 'rematch' });
    await b.until((r) => r.phase === 'lobby');
    expect(b.room!.players.every((p) => !p.ready)).toBe(true);
    expect(await a.err({ t: 'config', cityId: 'berlin', settings: { modules: [], turnSeconds: 0, autoPass: true } })).toBe('ok');
    await b.send({ t: 'ready', ready: true });
    await a.send({ t: 'start' });
    await b.until((r) => r.phase === 'playing' && r.game!.cityId === 'berlin');
    expect(b.room!.game!.players[b.you]!.segments).toEqual([]);
  });

  it('lets the host force the next round', async () => {
    const { a, b, data } = await started();
    while (data.game!.phase === 'playing')
      for (const c of [a, b]) if (data.game!.phase === 'playing' && data.game!.players[c.you]!.status === 'deciding') await c.send({ t: 'pass', turn: turnKey(data.game!, c.you) });
    expect(await b.err({ t: 'continue', round: 0, force: true })).toBe('notHost');
    expect(await a.err({ t: 'continue', round: 0, force: true })).toBe('ok');
    expect(data.game!.round).toBe(1);
    expect(await a.err({ t: 'continue', round: 0 })).toBe('wrongPhase');
  });
});

describe('transport hardening', () => {
  it('rejects malformed and out-of-schema messages without dropping the connection', async () => {
    const { port } = await server();
    const c = await new TestClient(port).open();
    expect(await c.raw('{"rid":77,"t":"explode"}')).toMatchObject({ ok: false, error: 'badMessage' });
    expect(await c.raw('{"rid":78,"t":"create","name":"","avatar":0,"cityId":"london"}')).toMatchObject({ ok: false, error: 'badMessage' });
    expect(await c.raw('{"rid":79,"t":"create","name":"A","avatar":99,"cityId":"london"}')).toMatchObject({ ok: false, error: 'badMessage' });
    c.ws.send('not json');
    expect(await c.err({ t: 'start' })).toBe('noSession');
  });

  it('limits join attempts and message rate', async () => {
    const { port } = await server({ limits: { joinsPerMinute: 3, messagesPerSecond: 1000 } });
    const c = await new TestClient(port).open();
    const results: string[] = [];
    for (let i = 0; i < 5; i++) results.push(await c.err({ t: 'join', code: 'AAAAAA', name: 'x', avatar: 0 }));
    expect(results).toEqual(['roomNotFound', 'roomNotFound', 'roomNotFound', 'rateLimited', 'rateLimited']);
    const slow = await server({ limits: { messagesPerSecond: 2 } });
    const d = await new TestClient(slow.port).open();
    expect(await d.err({ t: 'start' })).toBe('noSession');
    expect(await d.err({ t: 'start' })).toBe('rateLimited');
  });

  it('limits visitors separately behind a trusted proxy and ignores the header otherwise', async () => {
    const limits = { connectionsPerIp: 1, messagesPerSecond: 500, joinsPerMinute: 100 };
    const behind = await server({ limits, trustProxy: true, ipHeader: 'cf-connecting-ip' });
    await new TestClient(behind.port).open(undefined, { 'cf-connecting-ip': '203.0.113.1' });
    await new TestClient(behind.port).open(undefined, { 'cf-connecting-ip': '203.0.113.2' });
    await expect(new TestClient(behind.port).open(undefined, { 'cf-connecting-ip': '203.0.113.2' })).rejects.toThrow('403');
    const open = await server({ limits, ipHeader: 'cf-connecting-ip' });
    await new TestClient(open.port).open(undefined, { 'cf-connecting-ip': '203.0.113.1' });
    await expect(new TestClient(open.port).open(undefined, { 'cf-connecting-ip': '203.0.113.2' })).rejects.toThrow('403');
  });

  it('refuses cross-site origins', async () => {
    const { port } = await server();
    await expect(new TestClient(port).open(undefined, { origin: 'https://evil.example' })).rejects.toThrow('403');
    await new TestClient(port).open(undefined, { origin: 'http://localhost:5173' });
  });

  it('never serves files outside the static folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'loom-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'index.html'), '<p>home</p>');
    const { port } = await server({ staticDir: dir });
    const get = (p: string) => fetch(`http://127.0.0.1:${port}${p}`);
    expect(await (await get('/')).text()).toContain('home');
    expect(await (await get('/room/ABC')).text()).toContain('home');
    expect((await get('/missing.js')).status).toBe(404);
    for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/..%5c..%5cpackage.json', '/%00']) {
      const r = await get(p);
      expect(await r.text()).not.toContain('"scripts"');
    }
    expect((await get('/%E0%A4%A')).status).toBe(400);
    expect((await (await get('/healthz')).json()) as unknown).toMatchObject({ ok: true });
  });
});

describe('room manager timers and persistence', () => {
  const token = (n: number) => `${n}`.padEnd(32, 'x');
  function managed(store = new MemoryStore()) {
    let now = 1_000_000;
    const m = new RoomManager({ store, now: () => now, ttlMs: 60_000, hostGraceMs: 5_000, skipGraceMs: 8_000, seed: () => 'seed' });
    return { m, store, tick: (ms: number) => { now += ms; m.sweep(); } };
  }
  const settings = { modules: [], turnSeconds: 45 as const, autoPass: true };

  it('expires idle rooms and frees their sessions', () => {
    const { m, tick } = managed();
    m.create(token(1), 'A', 0, 'london');
    tick(59_000);
    expect(m.size).toBe(1);
    tick(2_000);
    expect(m.size).toBe(0);
    expect(m.session(token(1))).toBeNull();
  });

  it('removes a room when the last player leaves', () => {
    const { m, store } = managed();
    const { room, playerId } = m.create(token(1), 'A', 0, 'london');
    m.leave(room, playerId);
    expect(m.size).toBe(0);
    expect(store.rooms.size).toBe(0);
  });

  it('hands over an offline host and skips offline players after a grace period', () => {
    const { m, tick } = managed();
    const { room, playerId: a } = m.create(token(1), 'A', 0, 'london');
    const { playerId: b } = m.join(token(2), room.code, 'B', 1);
    m.setReady(room, b, true);
    m.start(room, a);
    m.setConnected(room, a, false);
    tick(4_000);
    expect(room.hostId).toBe(a);
    tick(2_000);
    expect(room.hostId).toBe(b);
    expect(room.game!.players[a]!.status).toBe('deciding');
    tick(4_000);
    expect(room.game!.players[a]!.status).toBe('skipped');
  });

  it('waits when everyone is offline', () => {
    const { m, tick } = managed();
    const { room, playerId: a } = m.create(token(1), 'A', 0, 'london');
    m.start(room, a);
    const before = room.game!.reveal;
    m.setConnected(room, a, false);
    tick(30_000);
    expect(room.game!.reveal).toBe(before);
    expect(room.game!.players[a]!.status).toBe('deciding');
  });

  it('enforces the turn timer and stops it while paused', () => {
    const { m, tick } = managed();
    const { room, playerId: a } = m.create(token(1), 'A', 0, 'london');
    m.configure(room, a, 'london', settings);
    m.start(room, a);
    const start = room.game!.reveal;
    tick(30_000);
    m.pause(room, a, true);
    expect(m.deadline(room)).toBeNull();
    tick(40_000);
    m.pause(room, a, false);
    tick(10_000);
    expect(room.game!.reveal).toBe(start);
    tick(6_000);
    expect(room.game!.reveal).toBeGreaterThan(start);
  });

  it('restores rooms and games after a restart', () => {
    const { m, store } = managed();
    const { room, playerId: a } = m.create(token(1), 'A', 0, 'paris');
    m.start(room, a);
    const mv = playerLegalMoves(room.game!, getCity('paris')!, a)[0]!;
    m.build(room, a, turnKey(room.game!, a), mv.from, mv.edge);
    const again = managed(store).m;
    const s = again.session(token(1))!;
    expect(s.playerId).toBe(a);
    expect(s.room.game).toEqual(room.game);
    expect(s.room.players[0]!.offlineSince).not.toBeNull();
  });

  it('sends a game saved against an older map back to the lobby', () => {
    const { m, store } = managed();
    const { room, playerId: a } = m.create(token(1), 'A', 0, 'paris');
    m.start(room, a);
    const saved = JSON.parse(store.rooms.get(room.code)!) as RoomData;
    saved.game!.cityVersion = 0;
    store.save(saved);
    expect(managed(store).m.find(room.code)!.game).toBeNull();
  });

  it('writes files that survive a restart and ignores corrupt ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loom-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const m = new RoomManager({ store: new FileStore(dir) });
    const { room } = m.create(token(1), 'A', 0, 'tokyo');
    writeFileSync(join(dir, 'rooms', 'BROKEN.json'), '{oops');
    const again = new RoomManager({ store: new FileStore(dir) });
    expect(again.find(room.code)?.cityId).toBe('tokyo');
    expect(again.size).toBe(1);
    expect(() => new FileStore(dir).remove('../x')).toThrow();
  });

  it('stores only a hash of the session token', () => {
    const { m, store } = managed();
    m.create(token(1), 'A', 0, 'london');
    expect([...store.rooms.values()][0]).not.toContain(token(1));
  });

  it('rate limiter windows reset', () => {
    let t = 0;
    const r = new RateLimiter(2, 100, () => t);
    expect([r.take('a'), r.take('a'), r.take('a'), r.take('b')]).toEqual([true, true, false, true]);
    t = 100;
    expect(r.take('a')).toBe(true);
    t = 300;
    r.prune();
    r.forget('a');
  });
});
