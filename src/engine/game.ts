import { createRng, shuffle } from './rng';
import { indexCity } from './network';
import { checkMove, legalMoves, type MoveContext } from './moves';
import { scoreFinal, scoreLine } from './scoring';
import type {
  ActionResult, Card, CityPack, GameAction, GameState, LegalMove, LineId, ModuleId, PlayerState, RankEntry, RejectReason,
} from './types';

export const ROUNDS = 4;

export interface NewGame {
  city: CityPack;
  seed: string;
  players: string[];
  modules?: ModuleId[];
  autoPass?: boolean;
}

export function buildDeck(city: CityPack, seed: string, round: number, modules: ModuleId[]): Card[] {
  const cards = city.deck.filter((c) => !c.module || modules.includes(c.module));
  return shuffle(cards, createRng(`${seed}:deck:${round}`));
}

export function createGame(o: NewGame): GameState {
  const { city, seed } = o;
  if (o.players.length < 1 || o.players.length > city.maxPlayers) throw new Error('player count out of range');
  if (new Set(o.players).size !== o.players.length) throw new Error('duplicate player');
  const modules = (o.modules ?? []).filter((m) => city.modules.includes(m));
  const state: GameState = {
    cityId: city.id,
    cityVersion: city.version,
    seed,
    modules,
    autoPass: o.autoPass ?? true,
    phase: 'playing',
    round: 0,
    lineOrder: shuffle(city.lines.map((l) => l.id), createRng(`${seed}:lines`)),
    deck: buildDeck(city, seed, 0, modules),
    reveal: 0,
    players: Object.fromEntries(
      o.players.map((id): [string, PlayerState] => [id, { id, segments: [], status: 'deciding', left: 1, lineScores: [] }]),
    ),
    objectives: modules.includes('objectives')
      ? shuffle(city.objectives, createRng(`${seed}:objectives`)).slice(0, 2).map((x) => x.id)
      : [],
    revision: 0,
    log: [],
  };
  beginReveal(state, city);
  settle(state, city);
  return state;
}

export const activeLine = (s: Pick<GameState, 'lineOrder' | 'round'>): LineId => s.lineOrder[s.round]!;
export const activeCard = (s: Pick<GameState, 'deck' | 'reveal'>): Card => s.deck[s.reveal]!;

/** Identifies one decision point. Submissions carry it so stale clients are rejected. */
export function turnKey(s: Pick<GameState, 'round' | 'reveal' | 'players'>, playerId: string): string {
  return `${s.round}.${s.reveal}.${s.players[playerId]?.left ?? 0}`;
}

export function moveContext(s: GameState, city: CityPack, playerId: string): MoveContext {
  return { ix: indexCity(city), segments: s.players[playerId]!.segments, line: activeLine(s), card: activeCard(s) };
}

export function playerLegalMoves(s: GameState, city: CityPack, playerId: string): LegalMove[] {
  const p = s.players[playerId];
  if (!p || s.phase !== 'playing' || p.status !== 'deciding') return [];
  return legalMoves(moveContext(s, city, playerId));
}

/** How many lantern cards have been revealed this round, including the active card. */
export const lanternsSeen = (s: Pick<GameState, 'deck' | 'reveal'>) =>
  s.deck.slice(0, s.reveal + 1).filter((c) => c.lantern).length;

export function isLastReveal(s: GameState, city: CityPack): boolean {
  if (s.reveal >= s.deck.length - 1) return true;
  const end = city.roundEnd;
  return end.type === 'reveals' ? s.reveal + 1 >= end.count : lanternsSeen(s) >= end.count;
}

const activePlayers = (s: GameState) => Object.values(s.players).filter((p) => !p.retired);

function beginReveal(s: GameState, city: CityPack) {
  const card = activeCard(s);
  for (const p of activePlayers(s)) {
    p.status = 'deciding';
    p.left = card.segments ?? 1;
  }
  autoPassStuck(s, city);
}

function autoPassStuck(s: GameState, city: CityPack) {
  if (!s.autoPass) return;
  for (const p of activePlayers(s))
    if (p.status === 'deciding' && legalMoves(moveContext(s, city, p.id)).length === 0)
      p.status = p.left < (activeCard(s).segments ?? 1) ? 'built' : 'autoPassed';
}

function endRound(s: GameState, city: CityPack) {
  for (const p of Object.values(s.players)) p.lineScores.push(scoreLine(city, p.segments, activeLine(s)));
  s.phase = 'roundScoring';
}

/** Advance through cards while nobody has anything left to decide. */
function settle(s: GameState, city: CityPack) {
  while (s.phase === 'playing') {
    const players = activePlayers(s);
    if (players.some((p) => p.status === 'deciding')) return;
    if (isLastReveal(s, city) || players.length === 0) return endRound(s, city);
    s.reveal++;
    beginReveal(s, city);
  }
}

function finish(s: GameState, city: CityPack) {
  for (const p of Object.values(s.players)) p.final = scoreFinal(city, p.segments, p.lineScores, s.objectives);
  s.phase = 'finished';
  s.ranking = rank(s);
}

export function rank(s: Pick<GameState, 'players'>): RankEntry[] {
  const compare = (a: PlayerState, b: PlayerState) => {
    const d = b.final!.total - a.final!.total;
    if (d) return d;
    for (let i = 0; i < a.final!.tie.length; i++) {
      const t = b.final!.tie[i]! - a.final!.tie[i]!;
      if (t) return t;
    }
    return 0;
  };
  // Players who left are listed after everyone who finished.
  const order = Object.values(s.players).sort((a, b) => Number(!!a.retired) - Number(!!b.retired) || compare(a, b));
  let rankNo = 0;
  return order.map((p, i) => {
    const prev = order[i - 1];
    if (!prev || !!prev.retired !== !!p.retired || compare(prev, p) !== 0) rankNo = i + 1;
    return { playerId: p.id, rank: rankNo, total: p.final!.total };
  });
}

/** Pure reducer. Never mutates its input. */
export function applyAction(prev: GameState, city: CityPack, action: GameAction): ActionResult {
  const no = (reason: RejectReason): ActionResult => ({ ok: false, reason });
  const s = structuredClone(prev);

  if (action.type === 'nextRound') {
    if (s.phase !== 'roundScoring') return no('wrongPhase');
    if (action.round !== s.round) return no('staleTurn');
    if (s.round + 1 >= ROUNDS) finish(s, city);
    else {
      s.round++;
      s.reveal = 0;
      s.deck = buildDeck(city, s.seed, s.round, s.modules);
      s.phase = 'playing';
      beginReveal(s, city);
      settle(s, city);
    }
  } else {
    const p = Object.hasOwn(s.players, action.playerId) ? s.players[action.playerId] : undefined;
    if (!p) return no('unknownPlayer');
    if (action.type === 'retire') {
      if (p.retired || s.phase === 'finished') return no('alreadySubmitted');
      p.retired = true;
      p.status = 'left';
      settle(s, city);
    } else {
      if (s.phase !== 'playing') return no('notPlaying');
      const current = action.turn === turnKey(s, p.id);
      if (p.status !== 'deciding') return no(current ? 'alreadySubmitted' : 'staleTurn');
      if (!current) return no('staleTurn');
      const allowed = activeCard(s).segments ?? 1;
      if (action.type === 'build') {
        const ctx = moveContext(s, city, p.id);
        const bad = checkMove(ctx, action.from, action.edge);
        if (bad) return no(bad);
        const e = ctx.ix.edge.get(action.edge)!;
        p.segments.push({
          edge: e.id, from: action.from, to: e.a === action.from ? e.b : e.a,
          line: ctx.line, round: s.round, reveal: s.reveal,
        });
        p.left--;
        if (p.left === 0) p.status = 'built';
        else autoPassStuck(s, city);
      } else {
        p.status = p.left < allowed ? 'built' : action.type === 'skip' ? 'skipped' : 'passed';
      }
      settle(s, city);
    }
  }
  s.revision++;
  s.log.push(action);
  return { ok: true, state: s };
}

/** Rebuild a game from its seed and action log. */
export function replay(o: NewGame, log: GameAction[]): GameState {
  return log.reduce((s, a) => {
    const r = applyAction(s, o.city, a);
    if (!r.ok) throw new Error(`replay failed: ${r.reason}`);
    return r.state;
  }, createGame(o));
}
