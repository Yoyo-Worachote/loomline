import type { Point } from './types';

const EPS = 1e-6;

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** True when open segments ab and cd properly intersect (shared endpoints do not count). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < -EPS && o3 * o4 < -EPS;
}

export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (len2 < EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

export function countPolylineCrossings(a: Point, b: Point, line: Point[]): number {
  let n = 0;
  for (let i = 0; i + 1 < line.length; i++) if (segmentsCross(a, b, line[i]!, line[i + 1]!)) n++;
  return n;
}

/** Keep the part of a convex polygon that is closer to `p` than to `q`. */
export function clipCloser(poly: Point[], p: Point, q: Point): Point[] {
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  const nx = q.x - p.x;
  const ny = q.y - p.y;
  const side = (v: Point) => (v.x - mx) * nx + (v.y - my) * ny;
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i]!;
    const d = poly[(i + 1) % poly.length]!;
    const sc = side(c);
    const sd = side(d);
    if (sc <= 0) out.push(c);
    if (sc * sd < 0) {
      const t = sc / (sc - sd);
      out.push({ x: c.x + t * (d.x - c.x), y: c.y + t * (d.y - c.y) });
    }
  }
  return out;
}

export function voronoiCells(seeds: Point[], bounds: Point[]): Point[][] {
  return seeds.map((p, i) => seeds.reduce((poly, q, j) => (i === j ? poly : clipCloser(poly, p, q)), bounds));
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function centroid(poly: Point[]): Point {
  return {
    x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
    y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
  };
}
