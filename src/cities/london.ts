import { compileCity, makeDeck, rect, sampleCurve, sym, t, type StationSpec } from './compile';

/**
 * London — original schematic. Stations lie on "currents": rows that follow an invented river curve,
 * flattening out with distance. Nothing here is traced from any published map.
 */
const riverY = (x: number) => 362 + 62 * Math.sin((x / 1000) * Math.PI * 2.3 + 0.5);

/** Row offset from the river, first x, and one symbol per station (spacing is uniform). */
const ROWS: { key: string; offset: number; follow: number; x0: number; step: number; symbols: string }[] = [
  { key: 'a', offset: -266, follow: 0.25, x0: 78, step: 120, symbols: 'ldhsldsh' },
  { key: 'b', offset: -166, follow: 0.55, x0: 60, step: 110, symbols: 'shldhs*dl' },
  { key: 'c', offset: -66, follow: 0.95, x0: 112, step: 112, symbols: 'dslhdlsh' },
  { key: 'd', offset: 66, follow: 0.95, x0: 62, step: 111, symbols: 'hldshldhs' },
  { key: 'e', offset: 164, follow: 0.6, x0: 116, step: 110, symbols: 's*hdslhd' },
  { key: 'f', offset: 262, follow: 0.25, x0: 72, step: 122, symbols: 'dhsldhls' },
];

const FLAGS: Record<string, Partial<StationSpec>> = {
  a3: { landmark: true, name: t('สวนราชพฤกษ์', 'Regal Meadow') },
  b7: { name: t('ชุมทางเข็มทิศ', 'Compass Junction') },
  b4: { landmark: true, name: t('หอนาฬิกาทองแดง', 'Copper Clock') },
  c2: { landmark: true, name: t('ตลาดใบชา', 'Tea Exchange') },
  c7: { landmark: true, name: t('ป้อมอีกา', 'Raven Keep') },
  d5: { landmark: true, name: t('กงล้อเมฆ', 'Cloud Wheel') },
  e2: { name: t('ชุมทางโรงสี', 'Mill Junction') },
  e7: { landmark: true, name: t('อู่เรือสำเภา', 'Clipper Dock') },
  f4: { landmark: true, name: t('หอดูดาวเนินเขียว', 'Green Hill Dome') },
};

const stations: StationSpec[] = ROWS.flatMap((r) =>
  [...r.symbols].map((c, i) => {
    const x = r.x0 + r.step * i;
    const y = Math.round(362 + (riverY(x) - 362) * r.follow + r.offset);
    const id = `${r.key}${i + 1}`;
    return { id, x, y, symbol: sym(c), ...FLAGS[id] };
  }),
);

const COLUMNS = [100, 300, 500, 700, 900];
const NORTH = [
  ['n1', 'เวสต์เมียร์', 'Westmere'], ['n2', 'คิงส์โฟลด์', 'Kingsfold'], ['n3', 'แลนเทิร์นฮิลล์', 'Lantern Hill'],
  ['n4', 'ชอร์วิก', 'Shorewick'], ['n5', 'อีสต์วาร์ฟ', 'Eastwharf'],
] as const;
const SOUTH = [
  ['s1', 'ฟูลมาร์ช', 'Fulmarsh'], ['s2', 'แบตเตอร์มิลล์', 'Battermill'], ['s3', 'คอบเบิลแบงก์', 'Cobblebank'],
  ['s4', 'แทนเนอร์ยาร์ด', "Tanner's Yard"], ['s5', 'กรีนไฮธ์', 'Greenhythe'],
] as const;

export const london = compileCity({
  id: 'london',
  version: 1,
  name: t('ลอนดอน', 'London'),
  subtitle: t('สายน้ำและย่านเมือง', 'River & Districts'),
  description: t(
    'ข้ามแม่น้ำให้บ่อย กระจายให้หลายย่าน แต่อย่าลืมกระจุกสถานีไว้ในย่านเดียวเพื่อคูณคะแนน',
    'Cross the river often and spread across districts, while packing one district for a bigger multiplier.',
  ),
  complexity: 1,
  minutes: [20, 25],
  maxPlayers: 4,
  width: 1000,
  height: 720,
  bounds: rect(14, 14, 986, 706),
  river: sampleCurve(-20, 1020, 52, riverY),
  stations,
  districts: [
    ...NORTH.map(([id, th, en], i) => ({
      id, name: t(th, en), seed: { x: COLUMNS[i]!, y: riverY(COLUMNS[i]!) - 150 }, label: { x: COLUMNS[i]!, y: 40 },
    })),
    ...SOUTH.map(([id, th, en], i) => ({
      id, name: t(th, en), seed: { x: COLUMNS[i]!, y: riverY(COLUMNS[i]!) + 150 }, label: { x: COLUMNS[i]!, y: 690 },
    })),
  ],
  graph: { maxDist: 172, clearance: 24, riverMode: 'free' },
  lines: [
    { id: 'madder', name: t('สายครั่งแดง', 'Madder Line'), starts: ['b2'] },
    { id: 'lapis', name: t('สายน้ำเงินลาพิส', 'Lapis Line'), starts: ['e7'] },
    { id: 'turmeric', name: t('สายขมิ้น', 'Turmeric Line'), starts: ['e3'] },
    { id: 'plum', name: t('สายพลัม', 'Plum Line'), starts: ['b8'] },
  ],
  deck: makeDeck({ copies: 2, wilds: 1, branches: 1 }),
  roundEnd: { type: 'reveals', count: 8 },
  lineRules: [{ type: 'districtTimesConcentration' }, { type: 'riverCrossings', per: 3 }],
  finalRules: [
    { type: 'landmarkTrack', table: [0, 1, 2, 4, 6, 9, 12, 16, 20, 24, 28, 32] },
    { type: 'interchanges', table: { 2: 2, 3: 6, 4: 11 } },
  ],
  objectives: [
    { id: 'districts', rule: { type: 'districts', count: 9 }, points: 8 },
    { id: 'river', rule: { type: 'river', count: 6 }, points: 8 },
    { id: 'landmarks', rule: { type: 'landmarks', count: 5 }, points: 8 },
    { id: 'interchanges', rule: { type: 'interchanges', count: 6 }, points: 8 },
    { id: 'longLine', rule: { type: 'longLine', count: 9 }, points: 8 },
  ],
  modules: ['objectives', 'specials'],
  tieBreakers: ['interchanges', 'landmarks', 'stations'],
  rules: [
    t('แต่ละรอบเปิดการ์ด 8 ใบจากสำรับ 10 ใบ', 'Each round reveals 8 cards from a 10-card deck.'),
    t('คะแนนสาย = จำนวนย่านที่ไปถึง × จำนวนสถานีในย่านที่มีมากที่สุด', 'Line score = districts visited × stations in your busiest district.'),
    t('ทุกครั้งที่รางข้ามแม่น้ำ +3', 'Each time the line crosses the river: +3.'),
    t('จบเกม: แลนด์มาร์กยิ่งผ่านหลายสายยิ่งไต่ตารางคะแนน', 'End of game: every line visiting a landmark climbs the landmark track.'),
    t('จบเกม: จุดเชื่อมต่อ 2/3/4 สาย = 2/6/11 คะแนน', 'End of game: interchanges of 2/3/4 lines score 2/6/11.'),
  ],
  houseRuleNote: t(
    'กติกาและแผนที่เป็นของเกมนี้เอง ไม่ใช่การทำซ้ำเกมกระดานใด',
    'Rules and map were designed for this game; they do not reproduce any published board game.',
  ),
});
