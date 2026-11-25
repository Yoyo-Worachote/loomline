import { describe, expect, it } from 'vitest';
import { CITIES, getCity } from '../src/cities';
import { indexCity, lineNetwork, networkComponents } from '../src/engine/network';
import { checkMove } from '../src/engine/moves';
import { networkFacts, objectiveProgress, scoreFinal, scoreLine, tableAt } from '../src/engine/scoring';
import type { CityPack, LineId, ScorePart, Segment } from '../src/engine/types';
import { WILD, miniCity } from './fixtures';

/** Path of station ids -> segments. */
function path(city: CityPack, line: LineId, ids: string[]): Segment[] {
  return ids.slice(1).map((to, i) => {
    const from = ids[i]!;
    const edge = from < to ? `${from}-${to}` : `${to}-${from}`;
    if (!indexCity(city).edge.has(edge)) throw new Error(`no edge ${edge} in ${city.id}`);
    return { edge, from, to, line, round: 0, reveal: i };
  });
}
const pts = (parts: ScorePart[], rule: string) => parts.find((p) => p.rule === rule)?.points;

describe('line scoring', () => {
  const city = miniCity();
  it('multiplies districts by the busiest district and adds river crossings', () => {
    const s = path(city, 'madder', ['a', 'b', 'e', 'h', 'i']);
    const r = scoreLine(city, s, 'madder');
    expect(pts(r.parts, 'districtTimesConcentration')).toBe(2 * 4); // west: a; east: b,e,h,i
    expect(pts(r.parts, 'riverCrossings')).toBe(3);
    expect(r.total).toBe(11);
  });

  it('scores nothing for a line that was never drawn', () => {
    expect(scoreLine(city, [], 'madder').total).toBe(0);
  });

  it('clamps lookup tables', () => {
    expect(tableAt([0, 2, 5], 9)).toBe(5);
    expect(tableAt([0, 2, 5], -1)).toBe(0);
  });

  it('computes bridges, bank balance, landmarks, hub and station rules', () => {
    const c = miniCity({
      graph: { maxDist: 145, clearance: 10, riverMode: 'bridges', bridges: [['d', 'g'], ['f', 'i']] },
      bankA: [{ x: -50, y: -50 }, { x: 250, y: -50 }, { x: 250, y: 150 }, { x: -50, y: 150 }],
      lineRules: [
        { type: 'bridges', table: [0, 2, 5] }, { type: 'bankBalance', per: 2 }, { type: 'lineLandmarks', table: [0, 1, 4] },
        { type: 'hub', points: 3 }, { type: 'stationCount', per: 1 }, { type: 'districtPoints', per: 2 }, { type: 'concentrationPoints', per: 1 },
      ],
    });
    const r = scoreLine(c, path(c, 'madder', ['a', 'd', 'g', 'h', 'i', 'f', 'e']), 'madder');
    expect(pts(r.parts, 'bridges')).toBe(5);
    expect(pts(r.parts, 'bankBalance')).toBe(3 * 2); // a,d,f,e vs g,h,i
    expect(pts(r.parts, 'lineLandmarks')).toBe(1);
    expect(pts(r.parts, 'hub')).toBe(3);
    expect(pts(r.parts, 'stationCount')).toBe(7);
    expect(pts(r.parts, 'districtPoints')).toBe(4);
    expect(pts(r.parts, 'concentrationPoints')).toBe(4);
  });
});

describe('final scoring', () => {
  const city = miniCity({
    finalRules: [
      { type: 'interchanges', table: { 2: 2, 3: 6, 4: 11 } }, { type: 'landmarkTrack', table: [0, 1, 3, 6] },
      { type: 'stamps', table: [0, 4, 9] }, { type: 'loop', missing: 2, complete: 10 }, { type: 'oneNetwork', points: 8 },
    ],
  });

  it('scores interchanges for two, three and four lines', () => {
    const s = [
      ...path(city, 'madder', ['a', 'e']), ...path(city, 'lapis', ['c', 'e']),
      ...path(city, 'turmeric', ['g', 'e']), ...path(city, 'plum', ['i', 'e']),
    ];
    expect(networkFacts(city, s).interchange).toEqual({ 2: 0, 3: 0, 4: 1 });
    expect(pts(scoreFinal(city, s, [], []).parts, 'interchanges')).toBe(11);
    expect(pts(scoreFinal(city, s.slice(0, 3), [], []).parts, 'interchanges')).toBe(6);
    expect(pts(scoreFinal(city, s.slice(0, 2), [], []).parts, 'interchanges')).toBe(2);
    expect(pts(scoreFinal(city, s.slice(0, 1), [], []).parts, 'interchanges')).toBe(0);
  });

  it('does not count an untouched start station as connected', () => {
    const s = path(city, 'madder', ['a', 'b', 'c']); // c is lapis's unused start
    expect(networkFacts(city, s).interchange[2]).toBe(0);
  });

  it('counts each line at a landmark, stamps once per district, and the loop penalty or bonus', () => {
    const s = [...path(city, 'madder', ['a', 'b', 'c']), ...path(city, 'lapis', ['c', 'f', 'i'])];
    const f = scoreFinal(city, s, [], []);
    expect(networkFacts(city, s).landmarkVisits).toBe(3);
    expect(pts(f.parts, 'landmarkTrack')).toBe(6);
    expect(pts(f.parts, 'stamps')).toBe(9);
    expect(pts(f.parts, 'loop')).toBe(-4); // d and h missing
    const all = [...s, ...path(city, 'turmeric', ['g', 'd']), ...path(city, 'plum', ['i', 'h'])];
    expect(pts(scoreFinal(city, all, [], []).parts, 'loop')).toBe(10);
  });

  it('pays the single-network bonus only when all track is joined', () => {
    const joined = path(city, 'madder', ['a', 'b', 'c']);
    expect(pts(scoreFinal(city, joined, [], []).parts, 'oneNetwork')).toBe(8);
    expect(pts(scoreFinal(city, [...joined, ...path(city, 'turmeric', ['g', 'h'])], [], []).parts, 'oneNetwork')).toBe(0);
    expect(pts(scoreFinal(city, [], [], []).parts, 'oneNetwork')).toBe(0);
    expect(networkComponents([])).toBe(0);
  });

  it('awards objectives only when reached', () => {
    const s = path(city, 'madder', ['a', 'b', 'c']);
    const parts = scoreFinal(city, s, [], ['districts', 'landmarks']).parts.filter((p) => p.rule === 'objective');
    expect(parts.map((p) => p.points)).toEqual([5, 0]);
    expect(objectiveProgress(city, s, { type: 'longLine', count: 3 })).toBe(3);
  });
});

describe('dual-start lines', () => {
  const city = miniCity({
    mergeComponents: true,
    lines: [
      { id: 'madder', name: { th: '', en: '' }, starts: ['a', 'i'] }, { id: 'lapis', name: { th: '', en: '' }, starts: ['c', 'g'] },
      { id: 'turmeric', name: { th: '', en: '' }, starts: ['b', 'h'] }, { id: 'plum', name: { th: '', en: '' }, starts: ['d', 'f'] },
    ],
    lineRules: [{ type: 'linkStarts', points: 10 }, { type: 'stationCount', per: 1 }],
    finalRules: [{ type: 'linkedColors', table: [0, 0, 4, 10, 18] }],
  });
  const ix = indexCity(city);

  it('offers both starts, allows one join and forbids a second', () => {
    const half = path(city, 'madder', ['a', 'e']);
    const ctx = (segments: Segment[]) => ({ ix, segments, line: 'madder' as const, card: { ...WILD, anyOrigin: true } });
    expect(lineNetwork(ix, half, 'madder').components).toBe(2);
    expect(checkMove(ctx(half), 'e', 'e-i')).toBeNull();
    const linked = path(city, 'madder', ['a', 'e', 'i']);
    expect(lineNetwork(ix, linked, 'madder').components).toBe(1);
    const round = [...linked, ...path(city, 'madder', ['a', 'b'])];
    expect(checkMove(ctx(round), 'b', 'b-e')).toBe('loop');
  });

  it('pays the link bonus only when both starts are joined', () => {
    expect(pts(scoreLine(city, path(city, 'madder', ['a', 'e']), 'madder').parts, 'linkStarts')).toBe(0);
    expect(pts(scoreLine(city, path(city, 'madder', ['a', 'e', 'i']), 'madder').parts, 'linkStarts')).toBe(10);
    const two = [...path(city, 'madder', ['a', 'e', 'i']), ...path(city, 'lapis', ['c', 'b', 'd', 'g'])];
    expect(pts(scoreFinal(city, two, [], []).parts, 'linkedColors')).toBe(4);
  });
});

describe('city packs', () => {
  it('ships four packs', () => expect(CITIES.map((c) => c.id)).toEqual(['london', 'tokyo', 'paris', 'berlin']));

  describe.each(CITIES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const ix = indexCity(c);
    it('has unique ids, valid references and a non-empty district for every station', () => {
      expect(new Set(c.stations.map((s) => s.id)).size).toBe(c.stations.length);
      expect(new Set(c.edges.map((e) => e.id)).size).toBe(c.edges.length);
      expect(new Set(c.deck.map((x) => x.id)).size).toBe(c.deck.length);
      for (const d of c.districts) expect(c.stations.some((s) => s.district === d.id), d.id).toBe(true);
      for (const s of c.stations) {
        expect(ix.adj.get(s.id)!.length).toBeGreaterThanOrEqual(2);
        expect(s.x).toBeGreaterThan(20);
        expect(s.x).toBeLessThan(c.width - 20);
        expect(s.y).toBeGreaterThan(20);
        expect(s.y).toBeLessThan(c.height - 20);
      }
    });

    it('keeps stations far enough apart to tap and gives each symbol a fair share', () => {
      for (const a of c.stations) for (const b of c.stations) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(50);
      for (const s of ['drop', 'leaf', 'spark', 'hex']) expect(c.stations.filter((x) => x.symbol === s).length).toBeGreaterThanOrEqual(10);
    });

    it('is fully connected and has four lines with distinct starts', () => {
      const seen = new Set<string>();
      const stack = [c.stations[0]!.id];
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const e of ix.adj.get(id)!) stack.push(e.a === id ? e.b : e.a);
      }
      expect(seen.size).toBe(c.stations.length);
      const starts = c.lines.flatMap((l) => l.starts);
      expect(c.lines).toHaveLength(4);
      expect(new Set(starts).size).toBe(starts.length);
      for (const s of starts) expect(ix.station.has(s)).toBe(true);
    });

    it('has symmetric crossings', () => {
      for (const e of c.edges) for (const x of e.crosses) expect(ix.edge.get(x)!.crosses).toContain(e.id);
    });

    it('has a deck long enough for its round end', () => {
      const basic = c.deck.filter((x) => !x.module);
      if (c.roundEnd.type === 'reveals') expect(basic.length).toBeGreaterThan(c.roundEnd.count);
      else expect(basic.filter((x) => x.lantern).length).toBeGreaterThanOrEqual(c.roundEnd.count);
    });

    it('has bilingual text everywhere', () => {
      const texts = [c.name, c.subtitle, c.description, c.houseRuleNote, ...c.rules, ...c.districts.map((d) => d.name), ...c.stations.map((s) => s.name), ...c.lines.map((l) => l.name)];
      for (const t of texts) {
        expect(t.th.length).toBeGreaterThan(0);
        expect(t.en.length).toBeGreaterThan(0);
      }
    });
  });

  it('gives each city its own signature features', () => {
    const [l, t, p, b] = ['london', 'tokyo', 'paris', 'berlin'].map((id) => getCity(id)!) as [CityPack, CityPack, CityPack, CityPack];
    expect(l.edges.filter((e) => e.river).length).toBeGreaterThan(10);
    expect(t.districts).toHaveLength(13);
    expect(t.districts.filter((d) => d.satellite)).toHaveLength(4);
    expect(t.stations.filter((s) => s.loop)).toHaveLength(12);
    expect(new Set(t.stations.filter((s) => s.stamp).map((s) => s.district)).size).toBe(13);
    expect(p.edges.filter((e) => e.river && !e.bridge)).toHaveLength(0);
    expect(p.edges.filter((e) => e.bridge && e.river === 1).length).toBe(8);
    expect(p.stations.some((s) => s.hub)).toBe(true);
    expect(new Set(p.stations.map((s) => s.bank))).toEqual(new Set(['a', 'b']));
    expect(b.lines.every((x) => x.starts.length === 2)).toBe(true);
    expect(b.edges.filter((e) => e.tunnel).length).toBeGreaterThan(5);
  });

  it('lets a focused player link the two starts of every Berlin line within one round', () => {
    const b = getCity('berlin')!;
    const ix = indexCity(b);
    for (const l of b.lines) {
      const [from, to] = l.starts as [string, string];
      const dist = new Map([[from, 0]]);
      const q = [from];
      while (q.length) {
        const id = q.shift()!;
        for (const e of ix.adj.get(id)!) {
          if (e.tunnel) continue;
          const o = e.a === id ? e.b : e.a;
          if (!dist.has(o)) {
            dist.set(o, dist.get(id)! + 1);
            q.push(o);
          }
        }
      }
      expect(dist.get(to)!, l.id).toBeLessThanOrEqual(7);
    }
  });
});
