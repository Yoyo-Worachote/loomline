import { createHash, randomBytes, randomInt } from 'node:crypto';
import { getCity, CITIES } from '../cities';
import { applyAction, createGame, turnKey } from '../engine/game';
import type { GameAction, GameState } from '../engine/types';
import { CODE_ALPHABET, CODE_LENGTH } from '../shared/constants';
import type { ErrorCode, GameView, HistoryEntry, RoomPhase, RoomSettings, RoomView } from '../shared/protocol';
import type { RoomStore } from './store';

interface RoomPlayer {
  id: string;
  tokenHash: string;
  name: string;
  avatar: number;
  seat: number;
  ready: boolean;
  continued: boolean;
  left: boolean;
  /** Epoch ms since the player has had no open connection; null while connected. */
  offlineSince: number | null;
}

/** Persisted room record. */
export interface RoomData {
  code: string;
  revision: number;
  hostId: string;
  cityId: string;
  settings: RoomSettings;
  players: RoomPlayer[];
  paused: boolean;
  game: GameState | null;
  /** Start of the current card, for the optional turn timer. */
  turnStartedAt: number;
  /** Time already used when the game was paused. */
  pausedElapsed: number;
  createdAt: number;
  updatedAt: number;
  history: HistoryEntry[];
}

export interface RoomManagerOptions {
  store: RoomStore;
  now?: () => number;
  ttlMs?: number;
  maxRooms?: number;
  /** Delay before an offline host loses the role. */
  hostGraceMs?: number;
  /** Delay before an offline player is skipped automatically. */
  skipGraceMs?: number;
  seed?: () => string;
}

export class RoomError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

export interface RoomEvents {
  changed(room: RoomData): void;
  removed(room: RoomData, playerId: string, reason: 'kicked' | 'expired' | 'left'): void;
}

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const newId = () => randomBytes(8).toString('hex');

/**
 * Owns every room. All methods run synchronously on Node's single thread, so each action is atomic:
 * it either fully applies and bumps `revision`, or throws without touching the room.
 */
export class RoomManager {
  private readonly rooms = new Map<string, RoomData>();
  /** token hash -> room code */
  private readonly sessions = new Map<string, string>();
  private readonly store: RoomStore;
  private readonly now: () => number;
  private readonly ttl: number;
  private readonly maxRooms: number;
  private readonly hostGrace: number;
  private readonly skipGrace: number;
  private readonly seed: () => string;
  events: RoomEvents = { changed: () => {}, removed: () => {} };

  constructor(o: RoomManagerOptions) {
    this.store = o.store;
    this.now = o.now ?? Date.now;
    this.ttl = o.ttlMs ?? 12 * 3600_000;
    this.maxRooms = o.maxRooms ?? 2000;
    this.hostGrace = o.hostGraceMs ?? 60_000;
    this.skipGrace = o.skipGraceMs ?? 60_000;
    this.seed = o.seed ?? (() => randomBytes(12).toString('hex'));
    for (const room of this.store.loadAll()) this.restore(room);
  }

  private restore(room: RoomData) {
    const city = getCity(room.cityId);
    if (!city) return this.store.remove(room.code);
    // A game saved against an older map cannot be continued safely.
    if (room.game && room.game.cityVersion !== city.version) this.toLobby(room);
    for (const p of room.players) p.offlineSince = this.now();
    this.rooms.set(room.code, room);
    for (const p of room.players) if (!p.left) this.sessions.set(p.tokenHash, room.code);
  }

  get size() {
    return this.rooms.size;
  }

  find(code: string) {
    return this.rooms.get(code);
  }

  /** Resolve a session token to its seat. */
  session(token: string): { room: RoomData; playerId: string } | null {
    const hash = hashToken(token);
    const room = this.rooms.get(this.sessions.get(hash) ?? '');
    const player = room?.players.find((p) => p.tokenHash === hash && !p.left);
    return room && player ? { room, playerId: player.id } : null;
  }

  create(token: string, name: string, avatar: number, cityId: string): { room: RoomData; playerId: string } {
    if (this.session(token)) throw new RoomError('alreadyInRoom');
    if (!getCity(cityId)) throw new RoomError('unknownCity');
    if (this.rooms.size >= this.maxRooms) throw new RoomError('serverFull');
    let code: string;
    do code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while (this.rooms.has(code));
    const now = this.now();
    const room: RoomData = {
      code, revision: 0, hostId: '', cityId,
      settings: { modules: [], turnSeconds: 0, autoPass: true },
      players: [], paused: false, game: null, turnStartedAt: 0, pausedElapsed: 0, createdAt: now, updatedAt: now, history: [],
    };
    this.rooms.set(code, room);
    const playerId = this.addPlayer(room, token, name, avatar);
    room.hostId = playerId;
    this.commit(room);
    return { room, playerId };
  }

  join(token: string, code: string, name: string, avatar: number): { room: RoomData; playerId: string } {
    const existing = this.session(token);
    if (existing) {
      if (existing.room.code === code) return existing;
      throw new RoomError('alreadyInRoom');
    }
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('roomNotFound');
    if (room.game) throw new RoomError('gameInProgress');
    if (room.players.length >= getCity(room.cityId)!.maxPlayers) throw new RoomError('roomFull');
    if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new RoomError('nameTaken');
    const playerId = this.addPlayer(room, token, name, avatar);
    this.commit(room);
    return { room, playerId };
  }

  private addPlayer(room: RoomData, token: string, name: string, avatar: number): string {
    const used = new Set(room.players.map((p) => p.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    const id = newId();
    room.players.push({
      id, tokenHash: hashToken(token), name, avatar, seat, ready: false, continued: false, left: false, offlineSince: null,
    });
    room.players.sort((a, b) => a.seat - b.seat);
    this.sessions.set(hashToken(token), room.code);
    return id;
  }

  private player(room: RoomData, id: string): RoomPlayer {
    const p = room.players.find((x) => x.id === id && !x.left);
    if (!p) throw new RoomError('unknownPlayer');
    return p;
  }

  private needHost(room: RoomData, id: string) {
    this.player(room, id);
    if (room.hostId !== id) throw new RoomError('notHost');
  }

  leave(room: RoomData, playerId: string, reason: 'left' | 'kicked' = 'left') {
    const p = this.player(room, playerId);
    this.sessions.delete(p.tokenHash);
    if (room.game && room.game.phase !== 'finished') {
      // Keep the seat so the scoreboard stays complete, but stop waiting for them.
      p.left = true;
      p.ready = false;
      this.apply(room, { type: 'retire', playerId });
    } else if (room.game) p.left = true;
    else room.players = room.players.filter((x) => x.id !== playerId);
    const remaining = room.players.filter((x) => !x.left);
    this.events.removed(room, playerId, reason);
    if (!remaining.length) return this.destroy(room);
    if (room.hostId === playerId) this.passHost(room);
    this.maybeContinue(room);
    this.commit(room);
  }

  private passHost(room: RoomData) {
    const candidates = room.players.filter((p) => !p.left && p.id !== room.hostId);
    const next = candidates.find((p) => p.offlineSince === null) ?? candidates[0];
    if (next) room.hostId = next.id;
  }

  kick(room: RoomData, by: string, target: string) {
    this.needHost(room, by);
    if (room.game && room.game.phase !== 'finished') throw new RoomError('notInLobby');
    if (by === target) throw new RoomError('unknownPlayer');
    this.leave(room, target, 'kicked');
  }

  setReady(room: RoomData, playerId: string, ready: boolean) {
    const p = this.player(room, playerId);
    if (room.game) throw new RoomError('notInLobby');
    p.ready = ready;
    this.commit(room);
  }

  configure(room: RoomData, by: string, cityId: string, settings: RoomSettings) {
    this.needHost(room, by);
    if (room.game) throw new RoomError('notInLobby');
    const city = getCity(cityId);
    if (!city) throw new RoomError('unknownCity');
    const modules = [...new Set(settings.modules)].filter((m) => city.modules.includes(m));
    room.cityId = cityId;
    room.settings = { ...settings, modules };
    // Anything that changes the game should be agreed to again.
    for (const p of room.players) if (p.id !== room.hostId) p.ready = false;
    this.commit(room);
  }

  start(room: RoomData, by: string) {
    this.needHost(room, by);
    if (room.game) throw new RoomError('notInLobby');
    if (room.players.some((p) => p.id !== room.hostId && !p.ready)) throw new RoomError('notAllReady');
    room.game = createGame({
      city: getCity(room.cityId)!, seed: this.seed(), players: room.players.map((p) => p.id),
      modules: room.settings.modules, autoPass: room.settings.autoPass,
    });
    for (const p of room.players) p.continued = false;
    room.paused = false;
    this.resetTimer(room);
    this.commit(room);
  }

  private game(room: RoomData): GameState {
    if (!room.game) throw new RoomError('noGame');
    return room.game;
  }

  private cardKey = (g: GameState) => `${g.round}.${g.reveal}.${g.phase}`;

  private resetTimer(room: RoomData) {
    room.turnStartedAt = this.now();
    room.pausedElapsed = 0;
  }

  private apply(room: RoomData, action: GameAction) {
    const before = this.game(room);
    const r = applyAction(before, getCity(room.cityId)!, action);
    if (!r.ok) throw new RoomError(r.reason);
    room.game = r.state;
    if (this.cardKey(before) !== this.cardKey(r.state)) this.resetTimer(room);
    if (before.phase !== 'finished' && r.state.phase === 'finished') this.recordHistory(room);
  }

  private recordHistory(room: RoomData) {
    const g = room.game!;
    room.history.unshift({
      cityId: g.cityId,
      finishedAt: this.now(),
      results: g.ranking!.map((e) => ({ name: room.players.find((p) => p.id === e.playerId)?.name ?? '?', total: e.total, rank: e.rank })),
    });
    room.history.length = Math.min(room.history.length, 10);
  }

  build(room: RoomData, playerId: string, turn: string, from: string, edge: string) {
    this.player(room, playerId);
    this.game(room);
    if (room.paused) throw new RoomError('paused');
    this.apply(room, { type: 'build', playerId, turn, from, edge });
    this.commit(room);
  }

  pass(room: RoomData, playerId: string, turn: string) {
    this.player(room, playerId);
    this.game(room);
    if (room.paused) throw new RoomError('paused');
    this.apply(room, { type: 'pass', playerId, turn });
    this.commit(room);
  }

  /** Host moves the table along when someone has dropped. Connected players cannot be skipped. */
  skip(room: RoomData, by: string, target: string, turn: string) {
    this.needHost(room, by);
    this.game(room);
    if (room.paused) throw new RoomError('paused');
    if (this.player(room, target).offlineSince === null) throw new RoomError('unknownPlayer');
    this.apply(room, { type: 'skip', playerId: target, turn });
    this.commit(room);
  }

  continue(room: RoomData, playerId: string, round: number, force: boolean) {
    const p = this.player(room, playerId);
    const g = this.game(room);
    if (g.phase !== 'roundScoring') throw new RoomError('wrongPhase');
    if (g.round !== round) throw new RoomError('staleTurn');
    if (force) this.needHost(room, playerId);
    p.continued = true;
    if (force) for (const x of room.players) x.continued = true;
    this.maybeContinue(room);
    this.commit(room);
  }

  private maybeContinue(room: RoomData) {
    const g = room.game;
    if (!g || g.phase !== 'roundScoring') return;
    const waiting = room.players.filter((p) => !p.left && p.offlineSince === null);
    if (!waiting.length || waiting.some((p) => !p.continued)) return;
    for (const p of room.players) p.continued = false;
    this.apply(room, { type: 'nextRound', round: g.round });
  }

  pause(room: RoomData, by: string, paused: boolean) {
    this.needHost(room, by);
    const g = this.game(room);
    if (g.phase === 'finished') throw new RoomError('wrongPhase');
    if (room.paused !== paused) {
      if (paused) room.pausedElapsed = this.now() - room.turnStartedAt;
      else room.turnStartedAt = this.now() - room.pausedElapsed;
      room.paused = paused;
    }
    this.commit(room);
  }

  /** Abandon the running game and return everyone to the lobby. */
  restart(room: RoomData, by: string) {
    this.needHost(room, by);
    this.game(room);
    this.toLobby(room);
    this.commit(room);
  }

  rematch(room: RoomData, by: string) {
    this.needHost(room, by);
    if (this.game(room).phase !== 'finished') throw new RoomError('wrongPhase');
    this.toLobby(room);
    this.commit(room);
  }

  private toLobby(room: RoomData) {
    room.game = null;
    room.paused = false;
    room.players = room.players.filter((p) => !p.left);
    for (const p of room.players) {
      p.ready = false;
      p.continued = false;
    }
  }

  setConnected(room: RoomData, playerId: string, connected: boolean) {
    const p = room.players.find((x) => x.id === playerId);
    if (!p || p.left) return;
    const was = p.offlineSince === null;
    if (was === connected) return;
    p.offlineSince = connected ? null : this.now();
    // If the previous host is still away, whoever is here takes over via sweep().
    this.maybeContinue(room);
    this.commit(room);
  }

  deadline(room: RoomData): number | null {
    if (!room.settings.turnSeconds || room.paused || room.game?.phase !== 'playing') return null;
    return room.turnStartedAt + room.settings.turnSeconds * 1000;
  }

  private skipAll(room: RoomData, ids: string[]): boolean {
    let changed = false;
    const key = this.cardKey(room.game!);
    for (const id of ids) {
      const g = room.game!;
      if (this.cardKey(g) !== key || g.players[id]?.status !== 'deciding') continue;
      this.apply(room, { type: 'skip', playerId: id, turn: turnKey(g, id) });
      changed = true;
    }
    return changed;
  }

  /** Timers: expiry, host hand-over, offline skip and turn limits. Call about once a second. */
  sweep() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (now - room.updatedAt > this.ttl) {
        for (const p of room.players) if (!p.left) this.events.removed(room, p.id, 'expired');
        this.destroy(room);
        continue;
      }
      let changed = false;
      const online = room.players.filter((p) => !p.left && p.offlineSince === null);
      const host = room.players.find((p) => p.id === room.hostId);
      if (online.length && (!host || host.left || (host.offlineSince !== null && now - host.offlineSince > this.hostGrace))) {
        room.hostId = online[0]!.id;
        changed = true;
      }
      if (online.length && room.game?.phase === 'playing' && !room.paused) {
        const gone = room.players.filter((p) => !p.left && p.offlineSince !== null && now - p.offlineSince > this.skipGrace);
        changed = this.skipAll(room, gone.map((p) => p.id)) || changed;
        const deadline = this.deadline(room);
        if (deadline !== null && now > deadline + 500) changed = this.skipAll(room, room.players.map((p) => p.id)) || changed;
      }
      if (changed) this.commit(room);
    }
  }

  private destroy(room: RoomData) {
    this.rooms.delete(room.code);
    for (const p of room.players) if (this.sessions.get(p.tokenHash) === room.code) this.sessions.delete(p.tokenHash);
    this.store.remove(room.code);
  }

  private commit(room: RoomData) {
    if (!this.rooms.has(room.code)) return;
    room.revision++;
    room.updatedAt = this.now();
    try {
      this.store.save(room);
    } catch (e) {
      // Losing a snapshot is better than losing the game in progress.
      console.error('room snapshot failed:', (e as Error).message);
    }
    this.events.changed(room);
  }

  view(room: RoomData): RoomView {
    const phase: RoomPhase = room.game?.phase ?? 'lobby';
    return {
      code: room.code,
      revision: room.revision,
      hostId: room.hostId,
      phase,
      cityId: room.cityId,
      settings: room.settings,
      players: room.players.map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, seat: p.seat, ready: p.ready, connected: p.offlineSince === null,
        continued: p.continued, left: p.left,
      })),
      paused: room.paused,
      game: room.game ? gameView(room.game) : null,
      deadline: this.deadline(room),
      serverTime: this.now(),
      expiresAt: room.updatedAt + this.ttl,
      history: room.history,
    };
  }
}

export function gameView(g: GameState): GameView {
  return {
    cityId: g.cityId,
    modules: g.modules,
    phase: g.phase,
    round: g.round,
    lineOrder: g.lineOrder,
    revealed: g.deck.slice(0, g.reveal + 1),
    deckSize: g.deck.length,
    players: g.players,
    objectives: g.objectives,
    ...(g.phase === 'finished' ? { ranking: g.ranking, seed: g.seed, log: g.log } : {}),
  };
}

export const DEFAULT_CITY = CITIES[0]!.id;
