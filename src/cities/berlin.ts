import { compileCity, makeDeck, rect, sampleCurve, sym, t, type StationSpec } from './compile';

/** Berlin — original schematic: a woven diamond lattice cut by an invented canal, with twin western and eastern starts. */
const canalY = (x: number) => 360 + 120 * Math.sin((x / 1000) * Math.PI * 1.6 - 2.2);

/** Each row lists symbols for alternate columns; a dot leaves a hole in the lattice. */
const LATTICE = [
  '.dslh.',
  '.hldsd.',
  'lshdls',
  'sdhlshd',
  'hsd*sl',
  'dldhsdh',
  'shldhs',
  '.dslhl.',
  '.hdsl.',
];

const FLAGS: Record<string, Partial<StationSpec>> = {
  r2c2: { landmark: true, name: t('สวนสัตว์กระจก', 'Mirror Menagerie') },
  r2c4: { landmark: true, name: t('หอส่งคลื่น', 'Signal Spire') },
  r4c3: { hub: true, name: t('จัตุรัสกลาง', 'Mittelplatz') },
  r5c1: { landmark: true, name: t('ป่าสนเมือง', 'Pine Common') },
  r5c5: { landmark: true, name: t('กำแพงจิตรกรรม', 'Mural Mile') },
  r6c3: { landmark: true, name: t('ลานบินเก่า', 'Old Airfield') },
  r3c4: { landmark: true, name: t('เกาะหอศิลป์', 'Gallery Isle') },
};

const stations: StationSpec[] = LATTICE.flatMap((row, r) => {
  const dx = 148;
  const total = (row.length - 1) * dx;
  return [...row].flatMap((c, i): StationSpec[] => {
    if (c === '.') return [];
    const x = 500 - total / 2 + i * dx;
    // A small, fixed wobble keeps the lattice from reading as a ruled grid.
    const y = 56 + r * 76 + 9 * Math.sin(x / 130 + r);
    const id = `r${r}c${i}`;
    let py = Math.round(y);
    const gap = py - canalY(x);
    if (Math.abs(gap) < 26) py = Math.round(canalY(x) + (gap < 0 ? -26 : 26));
    return [{ id, x: Math.round(x), y: py, symbol: sym(c), ...FLAGS[id] }];
  });
});

const bezirk = (id: string, th: string, en: string, x: number, y: number) => ({ id, name: t(th, en), seed: { x, y } });

export const berlin = compileCity({
  id: 'berlin',
  version: 1,
  name: t('เบอร์ลิน', 'Berlin'),
  subtitle: t('สองจุดเริ่มต้น หนึ่งโครงข่าย', 'Two Starts, One Network'),
  description: t(
    'ทุกสายเริ่มจากสองฝั่งพร้อมกัน เชื่อมให้ติดกันเพื่อรับโบนัส และใช้การ์ดอุโมงค์ลอดคลอง',
    'Every line starts on both sides of town. Link the halves for a bonus, and tunnel beneath the canal.',
  ),
  complexity: 3,
  minutes: [25, 35],
  maxPlayers: 4,
  width: 1000,
  height: 720,
  bounds: rect(14, 14, 986, 706),
  river: sampleCurve(-20, 1020, 52, canalY),
  stations,
  districts: [
    bezirk('z1', 'วัลด์เอค', 'Waldeck', 150, 200),
    bezirk('z2', 'นอร์ดฮาเฟน', 'Nordhafen', 370, 120),
    bezirk('z3', 'โรเซนเฟลด์', 'Rosenfeld', 640, 120),
    bezirk('z4', 'ลิชเทนาว', 'Lichtenau', 860, 220),
    bezirk('z5', 'มิตเทลฮอฟ', 'Mittelhof', 500, 350),
    bezirk('z6', 'ซีเกลไฮม์', 'Ziegelheim', 150, 500),
    bezirk('z7', 'โครนบาค', 'Kronbach', 380, 600),
    bezirk('z8', 'ซืดพาร์ค', 'Südpark', 640, 600),
    bezirk('z9', 'เคอปาเฮ', 'Kupferaue', 860, 490),
  ],
  graph: { maxDist: 158, clearance: 24, riverMode: 'tunnels', bridges: [
      ['r2c0', 'r3c1'], ['r3c2', 'r4c1'], ['r4c3', 'r5c3'], ['r5c4', 'r6c4'], ['r5c5', 'r6c5'],
    ] },
  lines: [
    { id: 'madder', name: t('สายครั่งแดง', 'Madder Line'), starts: ['r2c1', 'r6c4'] },
    { id: 'lapis', name: t('สายน้ำเงินลาพิส', 'Lapis Line'), starts: ['r3c1', 'r5c4'] },
    { id: 'turmeric', name: t('สายขมิ้น', 'Turmeric Line'), starts: ['r7c2', 'r1c4'] },
    { id: 'plum', name: t('สายพลัม', 'Plum Line'), starts: ['r5c2', 'r3c5'] },
  ],
  deck: makeDeck({ copies: 2, wilds: 1, branches: 1, tunnels: 2, tunnelOnWild: true }),
  roundEnd: { type: 'reveals', count: 10 },
  mergeComponents: true,
  lineRules: [
    { type: 'districtPoints', per: 2 },
    { type: 'stationCount', per: 1 },
    { type: 'lineLandmarks', table: [0, 2, 4, 7, 10] },
    { type: 'linkStarts', points: 10 },
  ],
  finalRules: [
    { type: 'linkedColors', table: [0, 0, 4, 10, 18] },
    { type: 'oneNetwork', points: 8 },
    { type: 'interchanges', table: { 2: 1, 3: 4, 4: 8 } },
  ],
  objectives: [
    { id: 'landmarks', rule: { type: 'landmarks', count: 5 }, points: 8 },
    { id: 'interchanges', rule: { type: 'interchanges', count: 7 }, points: 8 },
    { id: 'districts', rule: { type: 'districts', count: 9 }, points: 8 },
    { id: 'river', rule: { type: 'river', count: 5 }, points: 8 },
    { id: 'longLine', rule: { type: 'longLine', count: 11 }, points: 8 },
  ],
  modules: ['objectives', 'specials'],
  tieBreakers: ['interchanges', 'districts', 'stations'],
  rules: [
    t('ทุกสีมีสถานีต้นทาง 2 แห่ง ต่อจากปลายรางของฝั่งไหนก็ได้', 'Every line has two start stations; extend from any endpoint of either half.'),
    t('เชื่อมสองส่วนของสีเดียวกันได้ครั้งเดียว: โบนัส +10 ในสายนั้น', 'Joining the two halves of a colour is allowed once and scores +10 for that line.'),
    t('เส้นประลอดคลองต้องใช้การ์ดอุโมงค์หรือการ์ดอิสระ', 'Dashed canal edges need a tunnel or wild card.'),
    t('คะแนนสาย = 2 ต่อย่าน + 1 ต่อสถานี + แลนด์มาร์ก 2/4/7/10', 'Line score = 2 per district + 1 per station + landmarks 2/4/7/10.'),
    t('จบเกม: เชื่อมสำเร็จ 2/3/4 สี = 4/10/18 และถ้ารางทั้งหมดต่อกันเป็นโครงข่ายเดียว +8', 'End of game: 2/3/4 linked colours score 4/10/18; one fully connected network scores 8.'),
    t('จบเกม: จุดเชื่อมต่อ 2/3/4 สาย = 1/4/8 คะแนน', 'End of game: interchanges of 2/3/4 lines score 1/4/8.'),
  ],
  houseRuleNote: t(
    'กติกาและแผนที่เป็นของเกมนี้เอง คลองและชื่อย่านเป็นเรื่องสมมติ ไม่ใช่การทำซ้ำเกมกระดานใด',
    'Rules and map were designed for this game; canal and district names are invented and no published game is reproduced.',
  ),
});
