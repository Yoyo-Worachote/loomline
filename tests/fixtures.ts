import { compileCity, makeDeck, rect, t, type CitySpec } from '../src/cities/compile';
import { activeLine, createGame } from '../src/engine/game';
import type { Card, CityPack, GameState, LineId, SymbolId } from '../src/engine/types';

/**
 * Nine stations on a 3×3 plan, 100 apart, with diagonals:
 *   a(drop) b(leaf) c(spark)
 *   d(hex)  e(any)  f(drop)      river between the d-e-f and g-h-i rows
 *   g(leaf) h(spark) i(hex)
 */
export function miniSpec(over: Partial<CitySpec> = {}): CitySpec {
  const S: [string, number, number, SymbolId | 'any'][] = [
    ['a', 0, 0, 'drop'], ['b', 100, 0, 'leaf'], ['c', 200, 0, 'spark'],
    ['d', 0, 100, 'hex'], ['e', 100, 100, 'any'], ['f', 200, 100, 'drop'],
    ['g', 0, 200, 'leaf'], ['h', 100, 200, 'spark'], ['i', 200, 200, 'hex'],
  ];
  return {
    id: 'mini', version: 1, name: t('จิ๋ว', 'Mini'), subtitle: t('', ''), description: t('', ''), complexity: 1, minutes: [1, 1],
    maxPlayers: 4, width: 200, height: 200, bounds: rect(-50, -50, 250, 250),
    river: [{ x: -50, y: 150 }, { x: 250, y: 150 }],
    stations: S.map(([id, x, y, symbol]) => ({
      id, x, y, symbol,
      ...(id === 'c' || id === 'i' ? { landmark: true } : {}),
      ...(id === 'a' || id === 'i' ? { stamp: true } : {}),
      ...(id === 'e' ? { hub: true } : {}),
      ...(['b', 'd', 'f', 'h'].includes(id) ? { loop: true } : {}),
    })),
    districts: [
      { id: 'west', name: t('ตก', 'West'), polygon: rect(-50, -50, 50, 250) },
      { id: 'east', name: t('ออก', 'East'), polygon: rect(50, -50, 250, 250) },
    ],
    graph: { maxDist: 145, clearance: 10 },
    lines: [
      { id: 'madder', name: t('แดง', 'Madder'), starts: ['a'] },
      { id: 'lapis', name: t('น้ำเงิน', 'Lapis'), starts: ['c'] },
      { id: 'turmeric', name: t('เหลือง', 'Turmeric'), starts: ['g'] },
      { id: 'plum', name: t('ม่วง', 'Plum'), starts: ['i'] },
    ],
    deck: makeDeck({ lanterns: ['drop1', 'leaf1'] }),
    roundEnd: { type: 'reveals', count: 4 },
    lineRules: [{ type: 'districtTimesConcentration' }, { type: 'riverCrossings', per: 3 }],
    finalRules: [{ type: 'interchanges', table: { 2: 2, 3: 6, 4: 11 } }, { type: 'landmarkTrack', table: [0, 1, 3, 6] }],
    objectives: [
      { id: 'districts', rule: { type: 'districts', count: 2 }, points: 5 },
      { id: 'landmarks', rule: { type: 'landmarks', count: 2 }, points: 5 },
    ],
    modules: ['objectives', 'specials'],
    tieBreakers: ['interchanges', 'stations'],
    rules: [], houseRuleNote: t('', ''),
    ...over,
  };
}

export const miniCity = (over?: Partial<CitySpec>): CityPack => compileCity(miniSpec(over));

export const WILD: Card = { id: 'w', kind: 'wild', symbol: 'any' };
export const BRANCH: Card = { id: 'b', kind: 'branch', symbol: 'any', anyOrigin: true };
export const card = (symbol: SymbolId): Card => ({ id: symbol, kind: 'symbol', symbol });

/** A game whose line order and deck are set by hand. */
export function riggedGame(city: CityPack, o: { line?: LineId; deck: Card[]; players?: string[]; autoPass?: boolean }): GameState {
  const s = createGame({ city, seed: 'test', players: o.players ?? ['p1'], autoPass: false });
  if (o.line) s.lineOrder = [o.line, ...s.lineOrder.filter((l) => l !== o.line)];
  s.deck = o.deck;
  s.reveal = 0;
  s.autoPass = o.autoPass ?? false;
  for (const p of Object.values(s.players)) {
    p.status = 'deciding';
    p.left = o.deck[0]!.segments ?? 1;
  }
  activeLine(s);
  return s;
}
