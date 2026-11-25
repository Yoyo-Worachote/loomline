import { lineNetwork, otherEnd, type CityIndex, type LineNetwork } from './network';
import type { Card, LegalMove, LineId, RejectReason, Segment } from './types';

export interface MoveContext {
  ix: CityIndex;
  segments: Segment[];
  line: LineId;
  card: Card;
}

const symbolFits = (ctx: MoveContext, to: string) => {
  const s = ctx.ix.station.get(to)!.symbol;
  return ctx.card.symbol === 'any' || s === 'any' || s === ctx.card.symbol;
};

export function isEndpoint(net: LineNetwork, id: string): boolean {
  return (net.degree.get(id) ?? 99) <= 1;
}

/** Returns why a move is illegal, or null when it is legal. The single source of truth for move rules. */
export function checkMove(ctx: MoveContext, from: string, edgeId: string, net?: LineNetwork): RejectReason | null {
  const { ix, card, segments, line } = ctx;
  const edge = ix.edge.get(edgeId);
  if (!edge || (edge.a !== from && edge.b !== from)) return 'noEdge';
  const n = net ?? lineNetwork(ix, segments, line);
  if (!n.degree.has(from)) return 'notOnLine';
  const to = otherEnd(edge, from);
  if (segments.some((s) => s.edge === edgeId)) return 'edgeUsed';
  if (n.degree.has(to)) {
    const joins = ix.city.mergeComponents && n.component.get(from) !== n.component.get(to);
    if (!joins) return 'loop';
  }
  if (!card.anyOrigin && !isEndpoint(n, from)) return 'notEndpoint';
  if (!symbolFits(ctx, to)) return 'symbolMismatch';
  if (edge.tunnel && !card.tunnelPass) return 'tunnel';
  if (!card.overpass && edge.crosses.length) {
    const blocked = new Set(edge.crosses);
    if (segments.some((s) => blocked.has(s.edge))) return 'crossing';
  }
  return null;
}

export function legalMoves(ctx: MoveContext): LegalMove[] {
  const net = lineNetwork(ctx.ix, ctx.segments, ctx.line);
  const out: LegalMove[] = [];
  for (const from of net.degree.keys())
    for (const e of ctx.ix.adj.get(from) ?? [])
      if (checkMove(ctx, from, e.id, net) === null) out.push({ from, to: otherEnd(e, from), edge: e.id });
  return out;
}

/** The reason closest to being legal is reported first so the hint is as useful as possible. */
const HINT_ORDER: RejectReason[] = [
  'crossing', 'tunnel', 'symbolMismatch', 'notEndpoint', 'loop', 'edgeUsed', 'notOnLine', 'noEdge',
];

/** Explain why no legal move reaches `to` (null when one does); used for UI feedback. */
export function explainTarget(ctx: MoveContext, to: string, from?: string): RejectReason | null {
  const net = lineNetwork(ctx.ix, ctx.segments, ctx.line);
  const edges = (ctx.ix.adj.get(to) ?? []).filter((e) => {
    const o = otherEnd(e, to);
    return from ? o === from : net.degree.has(o);
  });
  if (!edges.length) return net.degree.has(to) ? 'loop' : 'noEdge';
  const reasons = edges.map((e) => checkMove(ctx, otherEnd(e, to), e.id, net));
  if (reasons.includes(null)) return null;
  return HINT_ORDER.find((r) => reasons.includes(r)) ?? 'noEdge';
}
