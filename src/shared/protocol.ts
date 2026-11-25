import { z } from 'zod';
import { AVATAR_COUNT, CODE_LENGTH, MAX_NAME, normalizeCode } from './constants';
import type { Card, GameAction, GamePhase, LineId, ModuleId, PlayerState, RankEntry } from '../engine/types';

// Control and invisible/bidi characters would let a name spoof another player or break the layout.
const cleanName = (s: string) => s.normalize('NFC').replace(/\p{Cc}|\p{Cf}/gu, '').replace(/\s+/g, ' ').trim();

const nameSchema = z.string().max(60).transform(cleanName).pipe(z.string().min(1).max(MAX_NAME));
const avatarSchema = z.number().int().min(0).max(AVATAR_COUNT - 1);
const codeSchema = z.string().max(20).transform(normalizeCode).pipe(z.string().length(CODE_LENGTH));
const idSchema = z.string().min(1).max(40);
const turnSchema = z.string().max(16);

export const settingsSchema = z.object({
  modules: z.array(z.enum(['objectives', 'specials'])).max(2),
  turnSeconds: z.union([z.literal(0), z.literal(45), z.literal(90), z.literal(180)]),
  autoPass: z.boolean(),
});
export type RoomSettings = z.infer<typeof settingsSchema>;

const body = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), token: z.string().max(100).optional() }),
  z.object({ t: z.literal('create'), name: nameSchema, avatar: avatarSchema, cityId: idSchema }),
  z.object({ t: z.literal('join'), code: codeSchema, name: nameSchema, avatar: avatarSchema }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('ready'), ready: z.boolean() }),
  z.object({ t: z.literal('config'), cityId: idSchema, settings: settingsSchema }),
  z.object({ t: z.literal('kick'), playerId: idSchema }),
  z.object({ t: z.literal('start') }),
  z.object({ t: z.literal('build'), turn: turnSchema, from: idSchema, edge: idSchema }),
  z.object({ t: z.literal('pass'), turn: turnSchema }),
  z.object({ t: z.literal('skip'), playerId: idSchema, turn: turnSchema }),
  z.object({ t: z.literal('continue'), round: z.number().int().min(0).max(3), force: z.boolean().optional() }),
  z.object({ t: z.literal('pause'), paused: z.boolean() }),
  z.object({ t: z.literal('restart'), confirm: z.literal(true) }),
  z.object({ t: z.literal('rematch') }),
]);

export const clientMessageSchema = z.intersection(z.object({ rid: z.number().int().nonnegative() }), body);
export type ClientBody = z.input<typeof body>;
export type ClientMessage = z.output<typeof clientMessageSchema>;

export type ErrorCode =
  | 'badMessage' | 'rateLimited' | 'noSession' | 'alreadyInRoom' | 'roomNotFound' | 'roomFull' | 'gameInProgress'
  | 'nameTaken' | 'notHost' | 'notInLobby' | 'notAllReady' | 'unknownCity' | 'noGame' | 'paused' | 'serverFull' | 'unknownPlayer'
  | 'wrongPhase' | 'staleTurn' | 'notPlaying' | 'alreadySubmitted' | 'noEdge' | 'symbolMismatch' | 'crossing' | 'edgeUsed'
  | 'notOnLine' | 'notEndpoint' | 'loop' | 'tunnel' | 'offline' | 'timeout';

export type RoomPhase = 'lobby' | GamePhase;

export interface PlayerView {
  id: string;
  name: string;
  avatar: number;
  seat: number;
  ready: boolean;
  connected: boolean;
  /** Pressed “continue” on the round results. */
  continued: boolean;
  left: boolean;
}

/** Everything a client may know. The seed and the undrawn deck are never included while a game runs. */
export interface GameView {
  cityId: string;
  modules: ModuleId[];
  phase: GamePhase;
  round: number;
  lineOrder: LineId[];
  revealed: Card[];
  deckSize: number;
  players: Record<string, PlayerState>;
  objectives: string[];
  ranking?: RankEntry[];
  /** Only present once the game is over. */
  seed?: string;
  log?: GameAction[];
}

export interface HistoryEntry {
  cityId: string;
  finishedAt: number;
  results: { name: string; total: number; rank: number }[];
}

export interface RoomView {
  code: string;
  revision: number;
  hostId: string;
  phase: RoomPhase;
  cityId: string;
  settings: RoomSettings;
  players: PlayerView[];
  paused: boolean;
  game: GameView | null;
  /** Epoch ms of the current turn deadline, when a timer is on. */
  deadline: number | null;
  serverTime: number;
  expiresAt: number;
  history: HistoryEntry[];
}

export type ServerMessage =
  | { t: 'ack'; rid: number; ok: true; token?: string; playerId?: string }
  | { t: 'ack'; rid: number; ok: false; error: ErrorCode }
  | { t: 'room'; room: RoomView; you: string }
  | { t: 'noRoom'; reason: 'none' | 'kicked' | 'expired' | 'left' };
