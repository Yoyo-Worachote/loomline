import {
  countPolylineCrossings, dist, pointInPolygon, pointSegmentDistance, segmentsCross, voronoiCells,
} from '../engine/geometry';
import type { Card, CityPack, District, Edge, LText, Point, Station, StationSymbol, SymbolId } from '../engine/types';

/** Compact, hand-authored station description. */
export interface StationSpec extends Point {
  id: string;
  symbol: StationSymbol;
  /** Explicit district. Omit to use the nearest district seed. */
  district?: string;
  name?: LText;
  landmark?: boolean;
  stamp?: boolean;
  loop?: boolean;
  hub?: boolean;
}

export interface DistrictSpec {
  id: string;
  name: LText;
  /** Voronoi seed, or an explicit polygon. */
  seed?: Point;
  polygon?: Point[];
  label?: Point;
  satellite?: boolean;
}

export interface GraphSpec {
  /** Stations closer than this are joined when nothing is in the way. */
  maxDist: number;
  /** A connection is dropped if any other station lies this close to it. */
  clearance: number;
  /** Connections to add or remove by hand, as `a-b` pairs of station ids. */
  extra?: [string, string][];
  skip?: [string, string][];
  /**
   * How river-crossing connections behave:
   * `free` – ordinary edges that count as crossings;
   * `bridges` – only listed bridges cross, everything else is removed;
   * `tunnels` – listed bridges are free, the rest need a tunnel card.
   */
  riverMode?: 'free' | 'bridges' | 'tunnels';
  bridges?: [string, string][];
}

export interface CitySpec extends Omit<CityPack, 'stations' | 'edges' | 'districts'> {
  stations: StationSpec[];
  districts: DistrictSpec[];
  graph: GraphSpec;
  bounds: Point[];
  /** Closed polygon covering bank `a` of the river, when banks matter. */
  bankA?: Point[];
}

const SYMBOL_CODE: Record<string, StationSymbol> = { d: 'drop', l: 'leaf', s: 'spark', h: 'hex', '*': 'any' };

/** `d l s h *` -> symbol. */
export function sym(code: string): StationSymbol {
  const s = SYMBOL_CODE[code];
  if (!s) throw new Error(`unknown symbol code ${code}`);
  return s;
}

export const t = (th: string, en: string): LText => ({ th, en });

const edgeId = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Best spot for a district label: inside the polygon, away from stations and borders. Text is wide, so x counts less. */
function roomiestPoint(polygon: Point[], stations: Point[], width: number, height: number): Point {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  let best = { x: xs[0]!, y: ys[0]! };
  let bestRoom = -Infinity;
  for (let x = Math.min(...xs) + 6; x < Math.max(...xs); x += 6)
    for (let y = Math.min(...ys) + 6; y < Math.max(...ys); y += 6) {
      const p = { x, y };
      if (!pointInPolygon(p, polygon) || x < 84 || x > width - 84 || y < 34 || y > height - 34) continue;
      let room = Infinity;
      for (const s of stations) room = Math.min(room, Math.hypot((s.x - x) * 0.42, s.y - y));
      for (const dx of [-58, 58]) if (!pointInPolygon({ x: x + dx, y }, polygon)) room -= 14;
      for (const dy of [-18, 18]) if (!pointInPolygon({ x, y: y + dy }, polygon)) room -= 8;
      if (room > bestRoom) {
        bestRoom = room;
        best = p;
      }
    }
  return best;
}

export function compileCity(spec: CitySpec): CityPack {
  const { stations: rawStations, districts: rawDistricts, graph, bounds, bankA, ...rest } = spec;

  const seeded = rawDistricts.filter((d) => d.seed);
  const cells = voronoiCells(seeded.map((d) => d.seed!), bounds);
  const districts: District[] = rawDistricts.map((d) => {
    const polygon = d.polygon ?? cells[seeded.indexOf(d)]!;
    return { id: d.id, name: d.name, polygon, label: d.label ?? roomiestPoint(polygon, rawStations, spec.width, spec.height), satellite: d.satellite };
  });
  const districtOf = (p: Point): District => {
    const explicit = districts.find((d) => pointInPolygon(p, d.polygon));
    if (explicit) return explicit;
    return districts.reduce((best, d) => (dist(p, d.label) < dist(p, best.label) ? d : best));
  };

  const counters = new Map<string, number>();
  const stations: Station[] = rawStations.map((s) => {
    const d = s.district ? districts.find((x) => x.id === s.district)! : districtOf(s);
    const n = (counters.get(d.id) ?? 0) + 1;
    counters.set(d.id, n);
    return {
      ...s,
      district: d.id,
      name: s.name ?? { th: `${d.name.th} ${n}`, en: `${d.name.en} ${n}` },
      ...(bankA ? { bank: pointInPolygon(s, bankA) ? ('a' as const) : ('b' as const) } : {}),
    };
  });

  const byId = new Map(stations.map((s) => [s.id, s]));
  const bridges = new Set((graph.bridges ?? []).map(([a, b]) => edgeId(a, b)));
  const skip = new Set((graph.skip ?? []).map(([a, b]) => edgeId(a, b)));
  const wanted = new Set<string>();
  for (let i = 0; i < stations.length; i++)
    for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i]!;
      const b = stations[j]!;
      if (dist(a, b) > graph.maxDist) continue;
      if (stations.some((c) => c !== a && c !== b && pointSegmentDistance(c, a, b) < graph.clearance)) continue;
      wanted.add(edgeId(a.id, b.id));
    }
  for (const [a, b] of [...(graph.extra ?? []), ...(graph.bridges ?? [])]) wanted.add(edgeId(a, b));

  const edges: Edge[] = [];
  for (const id of wanted) {
    if (skip.has(id)) continue;
    const [ai, bi] = id.split('-') as [string, string];
    const a = byId.get(ai);
    const b = byId.get(bi);
    if (!a || !b) throw new Error(`${spec.id}: edge ${id} refers to an unknown station`);
    const river = spec.river ? countPolylineCrossings(a, b, spec.river) : 0;
    const bridge = bridges.has(id);
    if (river > 0 && !bridge && graph.riverMode === 'bridges') continue;
    edges.push({
      id, a: ai, b: bi, river, crosses: [],
      ...(bridge ? { bridge: true } : {}),
      ...(river > 0 && !bridge && graph.riverMode === 'tunnels' ? { tunnel: true } : {}),
    });
  }
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i]!;
      const f = edges[j]!;
      if (segmentsCross(byId.get(e.a)!, byId.get(e.b)!, byId.get(f.a)!, byId.get(f.b)!)) {
        e.crosses.push(f.id);
        f.crosses.push(e.id);
      }
    }
  return { ...rest, stations, edges, districts };
}

const symbolCards = (ids: readonly SymbolId[], copies: number): Card[] =>
  ids.flatMap((s) => Array.from({ length: copies }, (_, i): Card => ({ id: `${s}${i + 1}`, kind: 'symbol', symbol: s })));

export interface DeckOptions {
  copies?: number;
  wilds?: number;
  branches?: number;
  tunnels?: number;
  /** Card ids that carry a lantern. */
  lanterns?: string[];
  tunnelOnWild?: boolean;
}

/** Standard deck builder. The `specials` module adds a double-track and an overpass card. */
export function makeDeck(o: DeckOptions = {}): Card[] {
  const cards: Card[] = symbolCards(['drop', 'leaf', 'spark', 'hex'], o.copies ?? 2);
  for (let i = 1; i <= (o.wilds ?? 1); i++)
    cards.push({ id: `wild${i}`, kind: 'wild', symbol: 'any', ...(o.tunnelOnWild ? { tunnelPass: true } : {}) });
  for (let i = 1; i <= (o.branches ?? 1); i++) cards.push({ id: `branch${i}`, kind: 'branch', symbol: 'any', anyOrigin: true });
  for (let i = 1; i <= (o.tunnels ?? 0); i++)
    cards.push({ id: `tunnel${i}`, kind: 'special', symbol: 'any', tunnelPass: true });
  cards.push({ id: 'double', kind: 'special', symbol: 'any', segments: 2, module: 'specials' });
  cards.push({ id: 'overpass', kind: 'special', symbol: 'any', overpass: true, module: 'specials' });
  return cards.map((c) => (o.lanterns?.includes(c.id) ? { ...c, lantern: true } : c));
}

/** Sample a smooth curve through `y = f(x)`. */
export function sampleCurve(from: number, to: number, steps: number, f: (x: number) => number): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const x = from + ((to - from) * i) / steps;
    return { x, y: f(x) };
  });
}

export const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];
