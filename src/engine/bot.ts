import { activeLine, applyAction, createGame, playerLegalMoves, turnKey } from './game';
import { createRng } from './rng';
import { networkFacts, scoreFinal, scoreLine } from './scoring';
import type { CityPack, GameAction, GameState, LegalMove, ModuleId, Segment } from './types';

/** Test and balance helper only; the app has no AI opponents. */
export type BotSkill = 'random' | 'greedy';

function value(city: CityPack, s: GameState, id: string, m: LegalMove): number {
  const line = activeLine(s);
  const seg: Segment = { edge: m.edge, from: m.from, to: m.to, line, round: s.round, reveal: s.reveal };
  const segments = [...s.players[id]!.segments, seg];
  const f = networkFacts(city, segments);
  return (
    scoreLine(city, segments, line).total +
    scoreFinal(city, segments, [], s.objectives).total +
    0.1 * f.districts
  );
}

export function chooseBotAction(city: CityPack, s: GameState, id: string, skill: BotSkill, rng: () => number): GameAction {
  const turn = turnKey(s, id);
  const moves = playerLegalMoves(s, city, id);
  if (!moves.length) return { type: 'pass', playerId: id, turn };
  let pick = moves[Math.floor(rng() * moves.length)]!;
  if (skill === 'greedy') {
    let best = -Infinity;
    for (const m of moves) {
      const v = value(city, s, id, m) + rng() * 0.01;
      if (v > best) {
        best = v;
        pick = m;
      }
    }
  }
  return { type: 'build', playerId: id, turn, from: pick.from, edge: pick.edge };
}

export function playBotGame(
  city: CityPack, seed: string, players: number, skill: BotSkill, modules: ModuleId[], onStep?: (s: GameState) => void,
): GameState {
  const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  const rng = createRng(`${seed}:bot`);
  let s = createGame({ city, seed, players: ids, modules });
  for (let guard = 0; s.phase !== 'finished'; guard++) {
    if (guard > 2000) throw new Error('game did not finish');
    onStep?.(s);
    let action: GameAction;
    if (s.phase === 'roundScoring') action = { type: 'nextRound', round: s.round };
    else {
      const id = ids.find((x) => s.players[x]!.status === 'deciding')!;
      action = chooseBotAction(city, s, id, skill, rng);
    }
    const r = applyAction(s, city, action);
    if (!r.ok) throw new Error(`bot move rejected: ${r.reason}`);
    s = r.state;
  }
  return s;
}
