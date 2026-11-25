import type { Point } from '../engine/types';
import { compileCity, makeDeck, rect, sym, t, type DistrictSpec, type StationSpec } from './compile';

/** Tokyo — original schematic built from concentric rings around an invented central garden. */
const C: Point = { x: 500, y: 360 };
const polar = (deg: number, rx: number, ry: number): Point => ({
  x: Math.round(C.x + rx * Math.cos((deg * Math.PI) / 180)),
  y: Math.round(C.y + ry * Math.sin((deg * Math.PI) / 180)),
});

const CORE = { rx: 152, ry: 118 };
const RIM = { rx: 420, ry: 302 };

/** Eight sectors, clockwise from east. */
const SECTORS = [
  ['e', 'อาซากะ-โทบุ', 'Asahi East'], ['se', 'ชิโอมิ', 'Shiomi Bay'], ['s', 'มินามิโนะ', 'Minamino'], ['sw', 'ซากุระงาโอกะ', 'Sakura Rise'],
  ['w', 'นิชิโมริ', 'Nishimori'], ['nw', 'ทาเคบายาชิ', 'Takebayashi'], ['n', 'คิตะมาจิ', 'Kitamachi'], ['ne', 'ฮานะคาวะ', 'Hanakawa'],
] as const;
const sectorAt = (deg: number) => SECTORS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]![0];

const arc = (from: number, to: number, rx: number, ry: number, steps = 8): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => polar(from + ((to - from) * i) / steps, rx, ry));

const districts: DistrictSpec[] = [
  { id: 'core', name: t('สวนกลาง', 'Garden Core'), polygon: arc(0, 354, CORE.rx, CORE.ry, 59) },
  ...SECTORS.map(([id, th, en], i): DistrictSpec => {
    const a = i * 45 - 22.5;
    return {
      id, name: t(th, en),
      polygon: [...arc(a, a + 45, RIM.rx, RIM.ry), ...arc(a + 45, a, CORE.rx, CORE.ry)],
    };
  }),
  ...(
    [
      ['cse', 'เขาไดชิ', 'Mount Daishi', 22, 68, 984, 704], ['csw', 'อ่าวคาโมเมะ', 'Kamome Cove', 112, 158, 16, 704],
      ['cnw', 'เหมืองคุโรอิชิ', 'Kuroishi Mine', 202, 248, 16, 16], ['cne', 'ทุ่งลมคาเสะ', 'Kaze Field', 292, 338, 984, 16],
    ] as const
  ).map(([id, th, en, a, b, x, y]): DistrictSpec => {
    const inner = arc(a, b, RIM.rx + 12, RIM.ry + 10);
    const first = inner[0]!;
    const last = inner[inner.length - 1]!;
    const firstIsSide = Math.abs(first.x - C.x) > Math.abs(last.x - C.x);
    const side = { x, y: (firstIsSide ? first : last).y };
    const cap = { x: (firstIsSide ? last : first).x, y };
    const tail = firstIsSide ? [cap, { x, y }, side] : [side, { x, y }, cap];
    return { id, name: t(th, en), polygon: [...inner, ...tail], satellite: true };
  }),
];

const ring = (key: string, n: number, offset: number, rx: number, ry: number, symbols: string, extra: (deg: number, i: number) => Partial<StationSpec>): StationSpec[] =>
  [...symbols].slice(0, n).map((c, i) => {
    const deg = offset + (360 / n) * i;
    return { id: `${key}${i + 1}`, ...polar(deg, rx, ry), symbol: sym(c), district: sectorAt(deg), ...extra(deg, i) };
  });

const LANDMARKS: Record<string, Partial<StationSpec>> = {
  o2: { landmark: true, name: t('หอคอยเหล็กส้ม', 'Vermilion Mast') },
  o6: { landmark: true, name: t('สี่แยกพันก้าว', 'Thousand Step Crossing') },
  o10: { landmark: true, name: t('ศาลเจ้าต้นการบูร', 'Camphor Shrine') },
  o14: { landmark: true, name: t('ตรอกโคมแดง', 'Paper Lamp Alley') },
  p3: { name: t('ชุมทางวงแหวนใต้', 'South Loop Gate') },
  p9: { name: t('ชุมทางวงแหวนเหนือ', 'North Loop Gate') },
};

const STAMPED = new Set(['o1', 'o3', 'o5', 'o7', 'o9', 'o11', 'o13', 'o15']);

const stations: StationSpec[] = [
  { id: 'c0', x: C.x, y: C.y, symbol: 'any', district: 'core', hub: true, stamp: true, name: t('สวนหมื่นใบ', 'Myriad Leaf Garden') },
  ...ring('i', 6, 30, 104, 78, 'dhslhs', () => ({ district: 'core' })),
  ...ring('p', 12, 15, 222, 164, 'lsdhdlshslhd', (_, i) => ({ loop: true, ...LANDMARKS[`p${i + 1}`] })),
  ...ring('o', 16, 11.25, 366, 258, 'hdlsldhsdhslhlds', (_, i) => ({ ...(STAMPED.has(`o${i + 1}`) ? { stamp: true } : {}), ...LANDMARKS[`o${i + 1}`] })),
  ...(
    [
      ['cse', 'x', 908, 640, 's'], ['cse', 'x', 810, 652, 'l'], ['cse', 'x', 926, 548, 'd'],
      ['csw', 'y', 92, 640, 'h'], ['csw', 'y', 190, 652, 'd'], ['csw', 'y', 74, 548, 's'],
      ['cnw', 'z', 92, 80, 'l'], ['cnw', 'z', 190, 68, 's'], ['cnw', 'z', 74, 172, 'h'],
      ['cne', 'w', 908, 80, 'd'], ['cne', 'w', 810, 68, 'h'], ['cne', 'w', 926, 172, 'l'],
    ] as const
  ).map(([district, k, x, y, s], i): StationSpec => ({
    id: `${k}${(i % 3) + 1}`, x, y, symbol: sym(s), district, ...(i % 3 === 0 ? { stamp: true } : {}),
  })),
];

export const tokyo = compileCity({
  id: 'tokyo',
  version: 1,
  name: t('โตเกียว', 'Tokyo'),
  subtitle: t('วงแหวนกลางและตราประทับ', 'Central Loop & Stamps'),
  description: t(
    'ล่าตราประทับจาก 13 ย่าน และอย่าปล่อยให้สถานีบนวงแหวนกลางถูกทิ้ง รอบจะจบเมื่อโคมดวงที่สี่สว่าง',
    'Collect stamps from 13 districts and leave no loop station behind. Rounds end when the fourth lantern lights.',
  ),
  complexity: 2,
  minutes: [25, 35],
  maxPlayers: 4,
  width: 1000,
  height: 720,
  bounds: rect(14, 14, 986, 706),
  stations,
  districts,
  graph: { maxDist: 172, clearance: 22 },
  lines: [
    { id: 'madder', name: t('สายครั่งแดง', 'Madder Line'), starts: ['o4'] },
    { id: 'lapis', name: t('สายน้ำเงินลาพิส', 'Lapis Line'), starts: ['o8'] },
    { id: 'turmeric', name: t('สายขมิ้น', 'Turmeric Line'), starts: ['o12'] },
    { id: 'plum', name: t('สายพลัม', 'Plum Line'), starts: ['o16'] },
  ],
  deck: makeDeck({ copies: 2, wilds: 1, branches: 1, lanterns: ['drop1', 'leaf1', 'spark1', 'hex1', 'branch1'] }),
  roundEnd: { type: 'lanterns', count: 4 },
  lineRules: [{ type: 'districtPoints', per: 2 }, { type: 'concentrationPoints', per: 2 }],
  finalRules: [
    { type: 'stamps', table: [0, 1, 3, 5, 8, 11, 15, 19, 24, 29, 35, 41, 48, 55] },
    { type: 'loop', missing: 2, complete: 10 },
    { type: 'interchanges', table: { 2: 2, 3: 5, 4: 9 } },
    { type: 'landmarkTrack', table: [0, 1, 3, 5, 7, 10, 13, 16] },
  ],
  objectives: [
    { id: 'loopStations', rule: { type: 'loopStations', count: 11 }, points: 8 },
    { id: 'districts', rule: { type: 'districts', count: 11 }, points: 8 },
    { id: 'interchanges', rule: { type: 'interchanges', count: 6 }, points: 8 },
    { id: 'bigInterchange', rule: { type: 'bigInterchange', count: 2 }, points: 8 },
    { id: 'longLine', rule: { type: 'longLine', count: 9 }, points: 8 },
  ],
  modules: ['objectives', 'specials'],
  tieBreakers: ['districts', 'interchanges', 'stations'],
  rules: [
    t('สำรับ 10 ใบมีโคม 5 ใบ รอบจบทันทีหลังการ์ดโคมใบที่ 4', 'Five of the ten cards carry a lantern; the round ends after the fourth lantern card.'),
    t('คะแนนสาย = 2 ต่อย่านที่ไปถึง + 2 ต่อสถานีในย่านที่มีมากที่สุด', 'Line score = 2 per district visited + 2 per station in your busiest district.'),
    t('จบเกม: ตราประทับ (ย่านละ 1 ดวง) ยิ่งครบยิ่งได้มาก', 'End of game: one stamp per district, worth more the more you collect.'),
    t('จบเกม: สถานีวงแหวนที่ไม่มีสายผ่าน −2 ต่อสถานี ถ้าครบทั้ง 12 ได้ +10', 'End of game: −2 per unvisited loop station, or +10 if all 12 are visited.'),
    t('จบเกม: จุดเชื่อมต่อ 2/3/4 สาย = 2/5/9 คะแนน', 'End of game: interchanges of 2/3/4 lines score 2/5/9.'),
  ],
  houseRuleNote: t(
    'กติกาและแผนที่เป็นของเกมนี้เอง วงแหวนเป็นแผนผังสมมติ ไม่ใช่เส้นทางจริงหรือเกมกระดานใด',
    'Rules and map were designed for this game; the loop is invented and matches no real line or published game.',
  ),
});
