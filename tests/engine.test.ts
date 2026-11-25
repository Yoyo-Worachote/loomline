import { describe, expect, it } from 'vitest';
import {
  activeCard, applyAction, buildDeck, createGame, isLastReveal, lanternsSeen, playerLegalMoves, rank, replay, turnKey,
} from '../src/engine/game';
import { explainTarget } from '../src/engine/moves';
import { moveContext } from '../src/engine/game';
import { playBotGame } from '../src/engine/bot';
import { CITIES } from '../src/cities';
import type { Card, CityPack, GameAction, GameState } from '../src/engine/types';
import { BRANCH, WILD, card, miniCity, riggedGame } from './fixtures';

const city = miniCity();

const build = (s: GameState, from: string, edge: string, playerId = 'p1'): GameAction => ({
  type: 'build', playerId, turn: turnKey(s, playerId), from, edge,
});
const pass = (s: GameState, playerId = 'p1'): GameAction => ({ type: 'pass', playerId, turn: turnKey(s, playerId) });
function must(s: GameState, c: CityPack, a: GameAction): GameState {
  const r = applyAction(s, c, a);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}
const reason = (s: GameState, c: CityPack, a: GameAction) => {
  const r = applyAction(s, c, a);
  return r.ok ? 'ok' : r.reason;
};

describe('setup', () => {
  it('rejects bad player counts and duplicates', () => {
    expect(() => createGame({ city, seed: 'x', players: [] })).toThrow();
    expect(() => createGame({ city, seed: 'x', players: ['1', '2', '3', '4', '5'] })).toThrow();
    expect(() => createGame({ city, seed: 'x', players: ['1', '1'] })).toThrow();
  });

  it('is deterministic for a seed and differs between seeds and rounds', () => {
    const ids = (seed: string, round = 0) => buildDeck(city, seed, round, []).map((c) => c.id).join();
    expect(ids('alpha')).toBe(ids('alpha'));
    expect(ids('alpha')).not.toBe(ids('beta'));
    expect(ids('alpha', 0)).not.toBe(ids('alpha', 1));
    const a = createGame({ city, seed: 's', players: ['p1'] });
    expect(a).toEqual(createGame({ city, seed: 's', players: ['p1'] }));
    expect([...a.lineOrder].sort()).toEqual(['lapis', 'madder', 'plum', 'turmeric']);
  });

  it('adds special cards and objectives only when their module is on', () => {
    expect(buildDeck(city, 's', 0, [])).toHaveLength(10);
    expect(buildDeck(city, 's', 0, ['specials'])).toHaveLength(12);
    expect(createGame({ city, seed: 's', players: ['p1'] }).objectives).toEqual([]);
    expect(createGame({ city, seed: 's', players: ['p1'], modules: ['objectives'] }).objectives).toHaveLength(2);
  });
});

describe('move validation', () => {
  it('accepts a matching symbol from the start station', () => {
    const s = riggedGame(city, { line: 'madder', deck: [card('leaf'), WILD, WILD, WILD] });
    const next = must(s, city, build(s, 'a', 'a-b'));
    expect(next.players.p1!.segments).toEqual([{ edge: 'a-b', from: 'a', to: 'b', line: 'madder', round: 0, reveal: 0 }]);
    expect(next.reveal).toBe(1);
  });

  it('does not mutate the previous state', () => {
    const s = riggedGame(city, { line: 'madder', deck: [card('leaf'), WILD, WILD, WILD] });
    const copy = structuredClone(s);
    must(s, city, build(s, 'a', 'a-b'));
    expect(s).toEqual(copy);
  });

  it('rejects a wrong symbol, but any-symbol stations and wild cards match everything', () => {
    const s = riggedGame(city, { line: 'madder', deck: [card('spark'), WILD, WILD, WILD] });
    expect(reason(s, city, build(s, 'a', 'a-b'))).toBe('symbolMismatch');
    expect(reason(s, city, build(s, 'a', 'a-e'))).toBe('ok');
    const w = riggedGame(city, { line: 'madder', deck: [WILD, WILD, WILD, WILD] });
    expect(reason(w, city, build(w, 'a', 'a-b'))).toBe('ok');
    expect(reason(w, city, build(w, 'a', 'a-d'))).toBe('ok');
  });

  it('rejects unknown edges, edges away from the origin and origins off the line', () => {
    const s = riggedGame(city, { line: 'madder', deck: [WILD, WILD, WILD, WILD] });
    expect(reason(s, city, build(s, 'a', 'a-i'))).toBe('noEdge');
    expect(reason(s, city, build(s, 'a', 'b-c'))).toBe('noEdge');
    expect(reason(s, city, build(s, 'b', 'b-c'))).toBe('notOnLine');
    expect(reason(s, city, build(s, '__proto__', 'constructor'))).toBe('noEdge');
  });

  it('rejects reused edges and loops', () => {
    let s = riggedGame(city, { line: 'madder', deck: [WILD, WILD, WILD, WILD] });
    s = must(s, city, build(s, 'a', 'a-b'));
    expect(reason(s, city, build(s, 'b', 'a-b'))).toBe('edgeUsed');
    s = must(s, city, build(s, 'b', 'b-e'));
    expect(reason(s, city, build(s, 'e', 'a-e'))).toBe('loop');
  });

  it('lets another colour visit a station but not reuse its track', () => {
    const s = riggedGame(city, { line: 'lapis', deck: [WILD, WILD, WILD, WILD] });
    s.players.p1!.segments.push({ edge: 'b-c', from: 'b', to: 'c', line: 'madder', round: 0, reveal: 0 });
    expect(reason(s, city, build(s, 'c', 'b-c'))).toBe('edgeUsed');
    expect(reason(s, city, build(s, 'c', 'c-f'))).toBe('ok');
  });

  it('rejects crossings unless the card is an overpass', () => {
    // The diagonals a-e and b-d share a cell.
    const s = riggedGame(city, { line: 'madder', deck: [WILD, WILD, WILD, WILD] });
    s.players.p1!.segments.push({ edge: 'b-d', from: 'b', to: 'd', line: 'lapis', round: 0, reveal: 0 });
    expect(reason(s, city, build(s, 'a', 'a-e'))).toBe('crossing');
    const over = { ...s, deck: [{ ...WILD, overpass: true } as Card, WILD, WILD, WILD] };
    expect(reason(over, city, build(over, 'a', 'a-e'))).toBe('ok');
  });

  it('only extends from endpoints unless the card branches', () => {
    let s = riggedGame(city, { line: 'madder', deck: [WILD, WILD, WILD, BRANCH] });
    s = must(s, city, build(s, 'a', 'a-b'));
    s = must(s, city, build(s, 'b', 'b-c'));
    expect(reason(s, city, build(s, 'b', 'b-e'))).toBe('notEndpoint');
    expect(reason(s, city, build(s, 'a', 'a-d'))).toBe('ok'); // both ends stay open
    s = must(s, city, pass(s));
    expect(activeCard(s).kind).toBe('branch');
    expect(reason(s, city, build(s, 'b', 'b-e'))).toBe('ok');
  });

  it('requires a tunnel card for tunnel edges and allows free bridges', () => {
    const c = miniCity({ graph: { maxDist: 145, clearance: 10, riverMode: 'tunnels', bridges: [['d', 'g']] } });
    const s = riggedGame(c, { line: 'turmeric', deck: [WILD, WILD, WILD, WILD] });
    expect(reason(s, c, build(s, 'g', 'e-g'))).toBe('tunnel');
    expect(reason(s, c, build(s, 'g', 'd-g'))).toBe('ok');
    const t = { ...s, deck: [{ ...WILD, tunnelPass: true } as Card, WILD, WILD, WILD] };
    expect(reason(t, c, build(t, 'g', 'e-g'))).toBe('ok');
  });

  it('removes non-bridge river edges in bridge mode', () => {
    const c = miniCity({ graph: { maxDist: 145, clearance: 10, riverMode: 'bridges', bridges: [['d', 'g']] } });
    expect(c.edges.filter((e) => e.river).map((e) => e.id)).toEqual(['d-g']);
  });

  it('explains unreachable targets and agrees with the legal move list', () => {
    const s = riggedGame(city, { line: 'madder', deck: [card('spark'), WILD, WILD, WILD] });
    const ctx = moveContext(s, city, 'p1');
    expect(explainTarget(ctx, 'b')).toBe('symbolMismatch');
    expect(explainTarget(ctx, 'i')).toBe('noEdge');
    expect(explainTarget(ctx, 'e')).toBeNull();
    expect(playerLegalMoves(s, city, 'p1').map((m) => m.to)).toEqual(['e']);
  });
});

describe('special cards', () => {
  it('gives two segments on a double card, with its own turn key per step', () => {
    const double: Card = { id: 'x2', kind: 'special', symbol: 'any', segments: 2 };
    let s = riggedGame(city, { line: 'madder', deck: [double, WILD, WILD, WILD] });
    const first = build(s, 'a', 'a-b');
    s = must(s, city, first);
    expect(s.reveal).toBe(0);
    expect(s.players.p1!.status).toBe('deciding');
    expect(reason(s, city, first)).toBe('staleTurn');
    s = must(s, city, build(s, 'b', 'b-c'));
    expect(s.reveal).toBe(1);
  });

  it('counts a double card stopped early as built, not passed', () => {
    const double: Card = { id: 'x2', kind: 'special', symbol: 'any', segments: 2 };
    let s = riggedGame(city, { line: 'madder', deck: [double, WILD, WILD, WILD], players: ['p1', 'p2'] });
    s = must(s, city, build(s, 'a', 'a-b'));
    s = must(s, city, pass(s));
    expect(s.players.p1!.status).toBe('built');
  });
});

describe('turn flow', () => {
  it('waits for every player before revealing the next card', () => {
    let s = riggedGame(city, { line: 'madder', deck: [WILD, WILD, WILD, WILD], players: ['p1', 'p2'] });
    s = must(s, city, build(s, 'a', 'a-b'));
    expect(s.reveal).toBe(0);
    expect(reason(s, city, pass(s))).toBe('alreadySubmitted');
    s = must(s, city, pass(s, 'p2'));
    expect(s.reveal).toBe(1);
    expect(s.players.p2!.segments).toEqual([]);
  });

  it('rejects stale turns, strangers and prototype names', () => {
    const s = riggedGame(city, { line: 'madder', deck: [WILD, WILD, WILD, WILD], players: ['p1', 'p2'] });
    expect(reason(s, city, { type: 'pass', playerId: 'p1', turn: '3.0.1' })).toBe('staleTurn');
    expect(reason(s, city, { type: 'pass', playerId: 'zz', turn: '0.0.1' })).toBe('unknownPlayer');
    expect(reason(s, city, { type: 'pass', playerId: 'constructor', turn: '0.0.1' })).toBe('unknownPlayer');
  });

  it('auto-passes players with no legal move', () => {
    let s = riggedGame(city, { line: 'madder', deck: [card('leaf'), card('spark'), WILD, WILD], autoPass: true });
    s = must(s, city, build(s, 'a', 'a-b'));
    // From a and b, spark reaches c (and any at e), so this one is still a decision.
    expect(s.reveal).toBe(1);
    const stuckCity = miniCity({ graph: { maxDist: 101, clearance: 10 } });
    let t = riggedGame(stuckCity, { line: 'madder', deck: [card('leaf'), card('drop'), WILD, WILD], autoPass: true });
    t = must(t, stuckCity, build(t, 'a', 'a-b'));
    // b's only unused neighbours are c (spark), e (any)... so drop can still reach e.
    expect(t.players.p1!.status).toBe('deciding');
    const none = miniCity({ graph: { maxDist: 101, clearance: 10, skip: [['b', 'e'], ['b', 'c'], ['a', 'd']] } });
    let u = riggedGame(none, { line: 'madder', deck: [card('leaf'), card('drop'), WILD, WILD], autoPass: true });
    u = must(u, none, build(u, 'a', 'a-b'));
    expect(u.phase).toBe('roundScoring');
  });

  it('ends a round by reveal count, or by lanterns', () => {
    const s = riggedGame(city, { deck: [WILD, WILD, WILD, WILD, WILD] });
    expect(isLastReveal({ ...s, reveal: 2 }, city)).toBe(false);
    expect(isLastReveal({ ...s, reveal: 3 }, city)).toBe(true);
    const lc = miniCity({ roundEnd: { type: 'lanterns', count: 2 } });
    const L: Card = { ...WILD, lantern: true };
    const ls = riggedGame(lc, { deck: [L, WILD, L, WILD] });
    expect(lanternsSeen({ ...ls, reveal: 1 })).toBe(1);
    expect(isLastReveal({ ...ls, reveal: 1 }, lc)).toBe(false);
    expect(isLastReveal({ ...ls, reveal: 2 }, lc)).toBe(true);
  });

  it('runs four rounds, one colour each, then finishes with a ranking', () => {
    let s = createGame({ city, seed: 'flow', players: ['p1', 'p2'], autoPass: false });
    const colours: string[] = [];
    for (let round = 0; round < 4; round++) {
      colours.push(s.lineOrder[s.round]!);
      while (s.phase === 'playing') for (const id of ['p1', 'p2']) if (s.phase === 'playing') s = must(s, city, pass(s, id));
      expect(s.phase).toBe('roundScoring');
      expect(s.players.p1!.lineScores).toHaveLength(round + 1);
      expect(reason(s, city, pass(s))).toBe('notPlaying');
      s = must(s, city, { type: 'nextRound', round });
    }
    expect(new Set(colours).size).toBe(4);
    expect(s.phase).toBe('finished');
    expect(s.ranking).toHaveLength(2);
    expect(reason(s, city, { type: 'nextRound', round: 3 })).toBe('wrongPhase');
  });

  it('ignores a second nextRound for the same round', () => {
    let s = createGame({ city, seed: 'flow', players: ['p1'], autoPass: false });
    while (s.phase === 'playing') s = must(s, city, pass(s));
    s = must(s, city, { type: 'nextRound', round: 0 });
    expect(reason(s, city, { type: 'nextRound', round: 0 })).toBe('wrongPhase');
  });

  it('stops waiting for a retired player and ranks them last', () => {
    let s = riggedGame(city, { line: 'madder', deck: [WILD, WILD, WILD, WILD], players: ['p1', 'p2'] });
    s = must(s, city, build(s, 'a', 'a-b'));
    s = must(s, city, { type: 'retire', playerId: 'p2' });
    expect(s.reveal).toBe(1);
    while (s.phase !== 'finished') s = must(s, city, s.phase === 'playing' ? pass(s) : { type: 'nextRound', round: s.round });
    expect(s.ranking!.map((r) => r.playerId)).toEqual(['p1', 'p2']);
  });

  it('breaks ties in order and shares rank on a true tie', () => {
    const s = riggedGame(city, { deck: [WILD], players: ['p1', 'p2', 'p3'] });
    const final = (total: number, tie: number[]) => ({ parts: [], total, tie });
    s.players.p1!.final = final(10, [1, 5]);
    s.players.p2!.final = final(10, [2, 0]);
    s.players.p3!.final = final(10, [1, 5]);
    expect(rank(s).map((r) => [r.playerId, r.rank])).toEqual([['p2', 1], ['p1', 2], ['p3', 2]]);
  });
});

describe.each(CITIES.map((c) => [c.id, c] as const))('full games: %s', (_id, pack) => {
  it('always finishes, keeps every rule invariant, and replays from its log', () => {
    for (const modules of [[], ['objectives', 'specials']] as const)
      for (let i = 0; i < 4; i++) {
        const seed = `${pack.id}-${i}`;
        const end = playBotGame(pack, seed, 1 + (i % 4), i % 2 ? 'greedy' : 'random', [...modules]);
        for (const p of Object.values(end.players)) {
          const edges = p.segments.map((s) => s.edge);
          expect(new Set(edges).size).toBe(edges.length);
          expect(p.lineScores).toHaveLength(4);
          expect(p.final!.total).toBe(p.final!.parts.reduce((s, x) => s + x.points, 0));
          if (!modules.length) {
            const used = new Set(edges);
            for (const e of pack.edges) if (used.has(e.id)) expect(e.crosses.some((x) => used.has(x))).toBe(false);
          }
          for (const l of pack.lines) {
            // A line is a forest: stations visited = segments + components.
            const own = p.segments.filter((s) => s.line === l.id);
            const nodes = new Set([...l.starts, ...own.flatMap((s) => [s.from, s.to])]);
            const parts = nodes.size - own.length;
            expect(parts).toBeGreaterThanOrEqual(1);
            expect(parts).toBeLessThanOrEqual(l.starts.length);
          }
        }
        const again = replay({ city: pack, seed, players: Object.keys(end.players), modules: [...modules] }, end.log);
        expect(again).toEqual(end);
      }
  });
});
