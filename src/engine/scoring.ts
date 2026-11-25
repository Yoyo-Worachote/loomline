import { indexCity, lineNetwork, linesAtStations, networkComponents } from './network';
import type {
  CityPack, FinalRule, FinalScore, LineId, LineRule, LineScore, ObjectiveRule, ScorePart, Segment, TieBreaker,
} from './types';

/** Reads a lookup table, clamping to its ends. */
export const tableAt = (table: number[], n: number) => table[Math.min(Math.max(n, 0), table.length - 1)] ?? 0;

/** Stations a line visits. A line with no track visits nothing. */
export function visited(segments: Segment[], line: LineId): Set<string> {
  const ids = new Set<string>();
  for (const s of segments) if (s.line === line) ids.add(s.from).add(s.to);
  return ids;
}

export interface LineFacts {
  stations: number;
  districts: number;
  concentration: number;
  river: number;
  bridges: number;
  landmarks: number;
  bankA: number;
  bankB: number;
  hub: boolean;
  linked: boolean;
}

export function lineFacts(city: CityPack, segments: Segment[], line: LineId): LineFacts {
  const ix = indexCity(city);
  const ids = visited(segments, line);
  const own = segments.filter((s) => s.line === line);
  const perDistrict = new Map<string, number>();
  const f: LineFacts = {
    stations: ids.size, districts: 0, concentration: 0, river: 0, bridges: 0, landmarks: 0,
    bankA: 0, bankB: 0, hub: false, linked: false,
  };
  for (const id of ids) {
    const s = ix.station.get(id)!;
    perDistrict.set(s.district, (perDistrict.get(s.district) ?? 0) + 1);
    if (s.landmark) f.landmarks++;
    if (s.hub) f.hub = true;
    if (s.bank === 'a') f.bankA++;
    if (s.bank === 'b') f.bankB++;
  }
  f.districts = perDistrict.size;
  f.concentration = Math.max(0, ...perDistrict.values());
  for (const s of own) {
    const e = ix.edge.get(s.edge)!;
    f.river += e.river;
    if (e.bridge) f.bridges++;
  }
  const starts = city.lines.find((l) => l.id === line)!.starts;
  f.linked = starts.length > 1 && own.length > 0 && lineNetwork(ix, segments, line).components === 1;
  return f;
}

type Detail = Record<string, number>;

function scoreLineRule(rule: LineRule, f: LineFacts): ScorePart {
  const part = (points: number, detail: Detail): ScorePart => ({ rule: rule.type, points, detail });
  switch (rule.type) {
    case 'districtTimesConcentration':
      return part(f.districts * f.concentration, { districts: f.districts, concentration: f.concentration });
    case 'districtPoints':
      return part(f.districts * rule.per, { n: f.districts, per: rule.per });
    case 'concentrationPoints':
      return part(f.concentration * rule.per, { n: f.concentration, per: rule.per });
    case 'riverCrossings':
      return part(f.river * rule.per, { n: f.river, per: rule.per });
    case 'bridges':
      return part(tableAt(rule.table, f.bridges), { n: f.bridges });
    case 'lineLandmarks':
      return part(tableAt(rule.table, f.landmarks), { n: f.landmarks });
    case 'bankBalance':
      return part(Math.min(f.bankA, f.bankB) * rule.per, { a: f.bankA, b: f.bankB, per: rule.per });
    case 'hub':
      return part(f.hub ? rule.points : 0, { n: f.hub ? 1 : 0 });
    case 'stationCount':
      return part(f.stations * rule.per, { n: f.stations, per: rule.per });
    case 'linkStarts':
      return part(f.linked ? rule.points : 0, { n: f.linked ? 1 : 0 });
  }
}

export function scoreLine(city: CityPack, segments: Segment[], line: LineId): LineScore {
  const facts = lineFacts(city, segments, line);
  const parts = city.lineRules.map((r) => scoreLineRule(r, facts));
  return { line, parts, total: parts.reduce((s, p) => s + p.points, 0) };
}

export interface NetFacts {
  interchange: Record<2 | 3 | 4, number>;
  /** Total line-visits to landmarks: one landmark on three lines counts 3. */
  landmarkVisits: number;
  landmarks: number;
  /** Districts whose stamp station is connected. */
  stamps: number;
  districts: number;
  stations: number;
  river: number;
  loopMissing: number;
  loopVisited: number;
  linked: number;
  longest: number;
  components: number;
}

export function networkFacts(city: CityPack, segments: Segment[]): NetFacts {
  const ix = indexCity(city);
  const at = linesAtStations(segments);
  const f: NetFacts = {
    interchange: { 2: 0, 3: 0, 4: 0 }, landmarkVisits: 0, landmarks: 0, stamps: 0, districts: 0,
    stations: at.size, river: 0, loopMissing: 0, loopVisited: 0, linked: 0, longest: 0,
    components: networkComponents(segments),
  };
  const districts = new Set<string>();
  const stamps = new Set<string>();
  for (const [id, lines] of at) {
    const s = ix.station.get(id)!;
    districts.add(s.district);
    if (lines.size >= 2) f.interchange[Math.min(lines.size, 4) as 2 | 3 | 4]++;
    if (s.landmark) {
      f.landmarks++;
      f.landmarkVisits += lines.size;
    }
    if (s.stamp) stamps.add(s.district);
  }
  f.districts = districts.size;
  f.stamps = stamps.size;
  for (const s of city.stations) if (s.loop) f[at.has(s.id) ? 'loopVisited' : 'loopMissing']++;
  for (const s of segments) f.river += ix.edge.get(s.edge)!.river;
  for (const l of city.lines) {
    const lf = lineFacts(city, segments, l.id);
    if (lf.linked) f.linked++;
    f.longest = Math.max(f.longest, lf.stations);
  }
  return f;
}

const anyInterchange = (f: NetFacts) => f.interchange[2] + f.interchange[3] + f.interchange[4];

function scoreFinalRule(rule: FinalRule, f: NetFacts): ScorePart {
  const part = (points: number, detail: Detail): ScorePart => ({ rule: rule.type, points, detail });
  switch (rule.type) {
    case 'landmarkTrack':
      return part(tableAt(rule.table, f.landmarkVisits), { n: f.landmarkVisits });
    case 'interchanges': {
      const i = f.interchange;
      return part(i[2] * rule.table[2] + i[3] * rule.table[3] + i[4] * rule.table[4], {
        two: i[2], three: i[3], four: i[4], p2: rule.table[2], p3: rule.table[3], p4: rule.table[4],
      });
    }
    case 'stamps':
      return part(tableAt(rule.table, f.stamps), { n: f.stamps });
    case 'loop':
      return part(f.loopMissing === 0 ? rule.complete : -f.loopMissing * rule.missing, { missing: f.loopMissing, per: rule.missing });
    case 'linkedColors':
      return part(tableAt(rule.table, f.linked), { n: f.linked });
    case 'oneNetwork':
      return part(f.components === 1 ? rule.points : 0, { n: f.components });
  }
}

export function objectiveProgress(city: CityPack, segments: Segment[], rule: ObjectiveRule): number {
  const f = networkFacts(city, segments);
  switch (rule.type) {
    case 'districts':
      return f.districts;
    case 'landmarks':
      return f.landmarks;
    case 'interchanges':
      return anyInterchange(f);
    case 'river':
      return f.river;
    case 'longLine':
      return f.longest;
    case 'bigInterchange':
      return f.interchange[3] + f.interchange[4];
    case 'loopStations':
      return f.loopVisited;
  }
}

function tieValue(f: NetFacts, tb: TieBreaker): number {
  return tb === 'interchanges' ? anyInterchange(f) : f[tb];
}

export function scoreFinal(city: CityPack, segments: Segment[], lineScores: LineScore[], objectiveIds: string[]): FinalScore {
  const facts = networkFacts(city, segments);
  const lines = lineScores.reduce((s, l) => s + l.total, 0);
  const parts: ScorePart[] = [{ rule: 'lines', points: lines, detail: { n: lineScores.length } }];
  for (const r of city.finalRules) parts.push(scoreFinalRule(r, facts));
  for (const id of objectiveIds) {
    const o = city.objectives.find((x) => x.id === id);
    if (!o) continue;
    const n = objectiveProgress(city, segments, o.rule);
    parts.push({
      rule: 'objective', objectiveId: id, points: n >= o.rule.count ? o.points : 0, detail: { n, goal: o.rule.count },
    });
  }
  return {
    parts,
    total: parts.reduce((s, p) => s + p.points, 0),
    tie: city.tieBreakers.map((t) => tieValue(facts, t)),
  };
}
