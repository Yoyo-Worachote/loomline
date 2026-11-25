import type { Card } from '../engine/types';
import { compileCity, makeDeck, rect, t } from './compile';

/** A tiny map used only by the tutorial. */
export const trainingCity = compileCity({
  id: 'training',
  version: 1,
  name: t('Practice Town', 'Practice Town'),
  subtitle: t('', ''),
  description: t('', ''),
  complexity: 1,
  minutes: [5, 5],
  maxPlayers: 1,
  width: 640,
  height: 420,
  bounds: rect(10, 10, 630, 410),
  river: [{ x: -10, y: 300 }, { x: 160, y: 276 }, { x: 330, y: 300 }, { x: 480, y: 278 }, { x: 650, y: 300 }],
  stations: [
    { id: 'a', x: 90, y: 120, symbol: 'hex' },
    { id: 'b', x: 220, y: 92, symbol: 'leaf' },
    { id: 'c', x: 250, y: 208, symbol: 'drop' },
    { id: 'd', x: 360, y: 108, symbol: 'spark' },
    { id: 'e', x: 408, y: 222, symbol: 'leaf', landmark: true },
    { id: 'f', x: 520, y: 128, symbol: 'hex' },
    { id: 'g', x: 120, y: 226, symbol: 'spark' },
    { id: 'h', x: 190, y: 356, symbol: 'hex' },
    { id: 'i', x: 352, y: 356, symbol: 'any' },
    { id: 'j', x: 540, y: 350, symbol: 'drop' },
  ],
  districts: [
    { id: 'w', name: t('West End', 'West End'), seed: { x: 130, y: 160 }, label: { x: 90, y: 44 } },
    { id: 'm', name: t('Middle Town', 'Middle Town'), seed: { x: 330, y: 160 }, label: { x: 320, y: 44 } },
    { id: 'x', name: t('East End', 'East End'), seed: { x: 530, y: 160 }, label: { x: 550, y: 44 } },
    { id: 's', name: t('Southwater', 'Southwater'), seed: { x: 330, y: 400 }, label: { x: 450, y: 396 } },
  ],
  graph: { maxDist: 190, clearance: 24, riverMode: 'free', skip: [['a', 'c'], ['b', 'g']] },
  lines: [
    { id: 'lapis', name: t('สาย Lapis', 'Lapis Line'), starts: ['a'] },
    { id: 'madder', name: t('สาย Madder', 'Madder Line'), starts: ['j'] },
    { id: 'turmeric', name: t('สาย Turmeric', 'Turmeric Line'), starts: ['f'] },
    { id: 'plum', name: t('สาย Plum', 'Plum Line'), starts: ['h'] },
  ],
  deck: makeDeck(),
  roundEnd: { type: 'reveals', count: 4 },
  lineRules: [{ type: 'districtTimesConcentration' }, { type: 'riverCrossings', per: 3 }],
  finalRules: [],
  objectives: [],
  modules: [],
  tieBreakers: ['stations'],
  rules: [],
  houseRuleNote: t('', ''),
});

export const TRAINING_DECK: Card[] = [
  { id: 'leaf', kind: 'symbol', symbol: 'leaf' },
  { id: 'spark', kind: 'symbol', symbol: 'spark' },
  { id: 'wild', kind: 'wild', symbol: 'any' },
  { id: 'branch', kind: 'branch', symbol: 'any', anyOrigin: true },
];
