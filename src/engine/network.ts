import type { CityPack, Edge, LineId, Segment, Station } from './types';

/** Cached lookups for a pack. Packs are immutable once compiled. */
export interface CityIndex {
  city: CityPack;
  station: Map<string, Station>;
  edge: Map<string, Edge>;
  /** station id -> edges touching it */
  adj: Map<string, Edge[]>;
}

const cache = new WeakMap<CityPack, CityIndex>();

export function indexCity(city: CityPack): CityIndex {
  const hit = cache.get(city);
  if (hit) return hit;
  const adj = new Map<string, Edge[]>(city.stations.map((s) => [s.id, []]));
  for (const e of city.edges) {
    adj.get(e.a)!.push(e);
    adj.get(e.b)!.push(e);
  }
  const ix: CityIndex = {
    city,
    station: new Map(city.stations.map((s) => [s.id, s])),
    edge: new Map(city.edges.map((e) => [e.id, e])),
    adj,
  };
  cache.set(city, ix);
  return ix;
}

export const otherEnd = (e: Edge, id: string) => (e.a === id ? e.b : e.a);

export interface LineNetwork {
  /** station id -> number of segments of this line touching it */
  degree: Map<string, number>;
  /** station id -> component index */
  component: Map<string, number>;
  components: number;
}

/** Every station on a line, including its departure stations even when nothing is drawn yet. */
export function lineNetwork(ix: CityIndex, segments: Segment[], line: LineId): LineNetwork {
  const starts = ix.city.lines.find((l) => l.id === line)!.starts;
  const degree = new Map<string, number>(starts.map((s) => [s, 0]));
  const links = new Map<string, string[]>();
  const link = (p: string, q: string) => {
    degree.set(p, (degree.get(p) ?? 0) + 1);
    links.set(p, [...(links.get(p) ?? []), q]);
  };
  for (const s of segments) {
    if (s.line !== line) continue;
    link(s.from, s.to);
    link(s.to, s.from);
  }
  const component = new Map<string, number>();
  let components = 0;
  for (const id of degree.keys()) {
    if (component.has(id)) continue;
    const stack = [id];
    component.set(id, components);
    while (stack.length) {
      for (const n of links.get(stack.pop()!) ?? []) {
        if (!component.has(n)) {
          component.set(n, components);
          stack.push(n);
        }
      }
    }
    components++;
  }
  return { degree, component, components };
}

/** Lines that actually have at least one segment at each station. */
export function linesAtStations(segments: Segment[]): Map<string, Set<LineId>> {
  const out = new Map<string, Set<LineId>>();
  for (const s of segments)
    for (const id of [s.from, s.to]) {
      const set = out.get(id) ?? new Set<LineId>();
      set.add(s.line);
      out.set(id, set);
    }
  return out;
}

/** Number of connected components among all drawn track, ignoring colour. */
export function networkComponents(segments: Segment[]): number {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (p === undefined) {
      parent.set(x, x);
      return x;
    }
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const s of segments) parent.set(find(s.from), find(s.to));
  return new Set([...parent.keys()].map(find)).size;
}
