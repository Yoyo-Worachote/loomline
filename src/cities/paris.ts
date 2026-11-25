import type { Point } from '../engine/types';
import { compileCity, makeDeck, rect, sampleCurve, sym, t, type StationSpec } from './compile';

/** Paris — original schematic. Stations follow a sunflower spiral around an invented grand hub. */
const C: Point = { x: 500, y: 352 };
const riverY = (x: number) => 440 - 62 * Math.exp(-(((x - 540) / 230) ** 2)) + 0.04 * (x - 500);
const RIVER = sampleCurve(-20, 1020, 52, riverY);

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** One symbol per spiral step, starting next to the hub. */
const SPIRAL = 'dlshhsdlslhdhdslldshdhlsslhdshdlhlsdldhssdlhhldslhsd';

/** Push stations off the water so every one clearly belongs to a bank. */
function clearRiver(p: Point): Point {
  const gap = p.y - riverY(p.x);
  const min = 36;
  return Math.abs(gap) >= min ? p : { x: p.x, y: riverY(p.x) + (gap < 0 ? -min : min) };
}

const FLAGS: Record<string, Partial<StationSpec>> = {
  q1: { x: 452, y: 268 },
  q29: { x: 214, y: 504 },
  q37: { x: 152, y: 452 },
  q50: { x: 84, y: 520 },
  q3: { landmark: true, name: t('Glass Pavilion', 'Glass Pavilion') },
  q12: { landmark: true, name: t('Lace Iron Tower', 'Lace Iron Tower') },
  q17: { landmark: true, name: t('Velvet Opera', 'Velvet Opera') },
  q22: { landmark: true, name: t("Painters' Hill", "Painters' Hill") },
  q25: { landmark: true, name: t('Tulip Parterre', 'Tulip Parterre') },
  q36: { landmark: true, name: t('Quayside Bookstalls', 'Quayside Bookstalls') },
  q41: { landmark: true, name: t('Southern Arch', 'Southern Arch') },
};

const stations: StationSpec[] = [
  { id: 'q0', x: C.x, y: C.y - 22, symbol: 'any', hub: true, name: t('Grand Hub', 'Grand Carrefour') },
  ...[...SPIRAL].slice(0, 50).map((c, i): StationSpec => {
    const n = i + 1.6;
    const r = 43 * Math.sqrt(n);
    const a = n * GOLDEN + 0.6;
    const p = clearRiver({ x: C.x + r * 1.42 * Math.cos(a), y: C.y + r * 1.02 * Math.sin(a) });
    const id = `q${i + 1}`;
    return { id, x: Math.round(p.x), y: Math.round(p.y), symbol: sym(c), ...FLAGS[id] };
  }),
];

const quarter = (id: string, th: string, en: string, x: number, y: number, label?: Point) => ({ id, name: t(th, en), seed: { x, y }, label });

export const paris = compileCity({
  id: 'paris',
  version: 1,
  name: t('ปารีส', 'Paris'),
  subtitle: t('Bridges & Junctions', 'Bridges & Junctions'),
  description: t(
    'ข้ามแม่น้ำได้เฉพาะที่สะพาน สร้างให้สมดุลทั้งสองฝั่ง และพาทุกสายผ่าน Grand Hub กลางเมือง',
    'The river can only be crossed at bridges. Balance both banks and bring every line through the Grand Carrefour.',
  ),
  complexity: 2,
  minutes: [25, 30],
  maxPlayers: 4,
  width: 1000,
  height: 720,
  bounds: rect(14, 14, 986, 706),
  river: RIVER,
  bankA: [{ x: -20, y: -20 }, { x: 1020, y: -20 }, ...[...RIVER].reverse()],
  stations,
  districts: [
    quarter('k1', 'กัวร์ดอร์', 'Cour Dorée', 500, 250),
    quarter('k2', 'แซ็งต์-ลูน', 'Sainte-Lune', 330, 270),
    quarter('k3', 'มาเรต์ แบลอ', 'Marais Bleu', 680, 270),
    quarter('k4', 'เปอตีต์ รีฟ', 'Petite Rive', 480, 455),
    quarter('k5', 'ปอร์ต ดูเอสต์', "Porte d'Ouest", 145, 300),
    quarter('k6', 'บุตต์ โรส', 'Butte Rose', 360, 100),
    quarter('k7', 'คานาล นอร์', 'Canal Nord', 640, 100, { x: 630, y: 42 }),
    quarter('k8', 'แวร์ตโคลลีน', 'Vertecolline', 850, 290, { x: 905, y: 118 }),
    quarter('k9', 'กรองด์ เซร์', 'Grande Serre', 720, 510),
    quarter('k10', 'มงต์แคลร์', 'Montclair', 260, 520),
    quarter('k11', 'ลา โดกส์', 'Les Docks', 500, 640),
  ],
  graph: { maxDist: 158, clearance: 22, riverMode: 'bridges', bridges: [
      ['q37', 'q45'], ['q24', 'q16'], ['q3', 'q8'], ['q0', 'q5'], ['q0', 'q2'], ['q7', 'q10'], ['q15', 'q23'], ['q28', 'q36'],
    ] },
  lines: [
    { id: 'madder', name: t('สาย Madder', 'Madder Line'), starts: ['q32'] },
    { id: 'lapis', name: t('สาย Lapis', 'Lapis Line'), starts: ['q28'] },
    { id: 'turmeric', name: t('สาย Turmeric', 'Turmeric Line'), starts: ['q31'] },
    { id: 'plum', name: t('สาย Plum', 'Plum Line'), starts: ['q38'] },
  ],
  deck: makeDeck({ copies: 2, wilds: 1, branches: 2 }),
  roundEnd: { type: 'reveals', count: 9 },
  lineRules: [
    { type: 'districtPoints', per: 2 },
    { type: 'bridges', table: [0, 2, 5, 9, 14] },
    { type: 'bankBalance', per: 1 },
    { type: 'lineLandmarks', table: [0, 1, 4, 8, 13] },
    { type: 'hub', points: 3 },
  ],
  finalRules: [{ type: 'interchanges', table: { 2: 3, 3: 7, 4: 13 } }],
  objectives: [
    { id: 'landmarks', rule: { type: 'landmarks', count: 6 }, points: 8 },
    { id: 'river', rule: { type: 'river', count: 5 }, points: 8 },
    { id: 'districts', rule: { type: 'districts', count: 10 }, points: 8 },
    { id: 'bigInterchange', rule: { type: 'bigInterchange', count: 1 }, points: 8 },
    { id: 'longLine', rule: { type: 'longLine', count: 10 }, points: 8 },
  ],
  modules: ['objectives', 'specials'],
  tieBreakers: ['interchanges', 'landmarks', 'districts'],
  rules: [
    t('แต่ละรอบเปิดการ์ด 9 ใบจากสำรับ 11 ใบ (มีการ์ด Branch 2 ใบ)', 'Each round reveals 9 of 11 cards, including two branch cards.'),
    t('รางข้ามแม่น้ำได้เฉพาะเส้นสะพาน สะพานแต่ละแห่งใช้ได้ครั้งเดียวต่อผู้เล่น', 'Track may only cross the river on bridges, and you may use each bridge once.'),
    t('คะแนนสาย = 2 ต่อย่าน + ตารางสะพาน 2/5/9/14 + จำนวนสถานีของฝั่งที่น้อยกว่า', 'Line score = 2 per district + bridges 2/5/9/14 + stations on your smaller bank.'),
    t('Landmark ในสายเดียวกัน 1/4/8/13 และผ่าน Grand Hub +3', 'Landmarks on one line score 1/4/8/13; passing the Grand Carrefour scores 3.'),
    t('จบเกม: Interchange 2/3/4 สาย = 3/7/13 คะแนน', 'End of game: interchanges of 2/3/4 lines score 3/7/13.'),
  ],
  houseRuleNote: t(
    'กติกาและแผนที่เป็นของเกมนี้เอง ชื่อย่านเป็นชื่อสมมติ ไม่ใช่การทำซ้ำเกมกระดานใด',
    'Rules and map were designed for this game, with invented quarter names; no published game is reproduced.',
  ),
});
