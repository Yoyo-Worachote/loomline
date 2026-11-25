import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { indexCity, linesAtStations } from '../../engine/network';
import type { CityPack, LegalMove, LineId, Segment, Station } from '../../engine/types';
import { useT } from '../i18n';
import { usePrefs } from '../prefs';
import { LINE_STYLE, SymbolPath } from './icons';

interface View {
  x: number;
  y: number;
  w: number;
}

export interface BoardProps {
  city: CityPack;
  segments: Segment[];
  /** Line being drawn now; its starts are emphasised. */
  activeLine?: LineId;
  targets?: ReadonlySet<string>;
  origins?: ReadonlySet<string>;
  origin?: string | null;
  preview?: LegalMove | null;
  onStation?: (id: string) => void;
  /** Small, non-interactive rendering. */
  mini?: boolean;
  label: string;
}

const MIN_W = 320;

/** Phones show the whole map very small, so stations are drawn larger there. */
const NARROW = '(max-width: 640px)';
function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia?.(NARROW);
      m?.addEventListener('change', cb);
      return () => m?.removeEventListener('change', cb);
    },
    () => !!window.matchMedia?.(NARROW).matches,
  );
}

const points = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** Static base layer; only changes with the city. */
const BaseLayer = memo(function BaseLayer({ city, mini }: { city: CityPack; mini?: boolean }) {
  const t = useT();
  const ix = indexCity(city);
  return (
    <g>
      <rect x={0} y={0} width={city.width} height={city.height} className="board-paper" />
      {city.districts.map((d, i) => (
        <polygon key={d.id} points={points(d.polygon)} className={`district tone-${i % 4}${d.satellite ? ' satellite' : ''}`} />
      ))}
      {city.river && <polyline points={points(city.river)} className="river" />}
      {city.river && <polyline points={points(city.river)} className="river-thread" />}
      {!mini &&
        city.districts.map((d) => (
          <text key={d.id} x={d.label.x} y={d.label.y} className="district-label">
            {t.l(d.name)}
          </text>
        ))}
      {city.edges.map((e) => {
        const a = ix.station.get(e.a)!;
        const b = ix.station.get(e.b)!;
        return (
          <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge${e.bridge ? ' bridge' : ''}${e.tunnel ? ' tunnel' : ''}`} />
        );
      })}
    </g>
  );
});

function Track({ city, seg, dx, fresh }: { city: CityPack; seg: Segment; dx: number; fresh?: boolean }) {
  const ix = indexCity(city);
  const a = ix.station.get(seg.from)!;
  const b = ix.station.get(seg.to)!;
  const s = LINE_STYLE[seg.line];
  const p = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, strokeLinecap: 'round' as const };
  return (
    <g className={fresh ? 'track fresh' : 'track'} data-edge={seg.edge}>
      <line {...p} stroke={s.deep} strokeWidth={12 + dx} />
      <line {...p} stroke={s.color} strokeWidth={8.5 + dx} />
      {s.stitch && <line {...p} stroke="#fff6e4" strokeWidth={2.4} strokeDasharray={s.stitch} />}
    </g>
  );
}

function stationLabel(s: Station, city: CityPack, t: ReturnType<typeof useT>, lines: LineId[], state: string) {
  const district = city.districts.find((d) => d.id === s.district)!;
  const bits = [t.l(s.name), t(`sym_${s.symbol}`), t.l(district.name)];
  if (s.landmark) bits.push(t('lg_landmark'));
  if (s.stamp) bits.push(t('lg_stamp'));
  if (s.loop) bits.push(t('lg_loop'));
  if (s.hub) bits.push(t('lg_hub'));
  for (const l of lines) bits.push(t.l(city.lines.find((x) => x.id === l)!.name));
  if (state) bits.push(state);
  return bits.join(', ');
}

export function Board(props: BoardProps) {
  const { city, segments, activeLine, targets, origins, origin, preview, onStation, mini, label } = props;
  const t = useT();
  const prefs = usePrefs();
  const svg = useRef<SVGSVGElement>(null);
  const ratio = city.height / city.width;
  const full = useMemo<View>(() => ({ x: 0, y: 0, w: city.width }), [city.width]);
  const initial = useMemo<View>(() => {
    if (mini || prefs.zoom === 'fit') return full;
    const w = city.width * 0.62;
    const start = city.stations.find((s) => s.id === city.lines.find((l) => l.id === activeLine)?.starts[0]);
    return clampView({ x: (start?.x ?? city.width / 2) - w / 2, y: (start?.y ?? city.height / 2) - (w * ratio) / 2, w }, city);
  }, [mini, prefs.zoom, full, city, activeLine, ratio]);
  const [view, setView] = useState<View>(initial);
  useEffect(() => setView(initial), [initial]);
  const zoomed = view.w < city.width - 1;

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) =>
      setView((v) => {
        const px = cx ?? v.x + v.w / 2;
        const py = cy ?? v.y + (v.w * ratio) / 2;
        const w = Math.min(city.width, Math.max(MIN_W, v.w * factor));
        const k = w / v.w;
        return clampView({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w }, city);
      }),
    [city, ratio],
  );

  const toBoard = useCallback((clientX: number, clientY: number) => {
    const el = svg.current;
    const m = el?.getScreenCTM?.();
    if (!el || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y, scale: m.a };
  }, []);

  // React attaches wheel handlers as passive, so zooming needs a native listener.
  useEffect(() => {
    const el = svg.current;
    if (!el || mini) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && !zoomed && e.deltaY > 0) return; // let the page scroll when fully zoomed out
      e.preventDefault();
      const p = toBoard(e.clientX, e.clientY);
      if (p) zoomAt(Math.exp(e.deltaY * 0.0016), p.x, p.y);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mini, toBoard, zoomAt, zoomed]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const onPointerDown = (e: RPointerEvent) => {
    if (pointers.current.size === 0) moved.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: RPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const others = [...pointers.current].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (!moved.current && Math.hypot(dx, dy) < 7) return;
    if (!moved.current) {
      moved.current = true;
      svg.current?.setPointerCapture?.(e.pointerId);
    }
    const scale = svg.current?.getScreenCTM?.()?.a ?? 1;
    const other = others[0];
    if (other) {
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const mid = toBoard((e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
      if (mid && after > 10) zoomAt(before / after, mid.x, mid.y);
    } else setView((v) => clampView({ ...v, x: v.x - dx / scale, y: v.y - dy / scale }, city));
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerEnd = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const choose = (id: string) => {
    if (!moved.current) onStation?.(id);
  };

  const at = useMemo(() => linesAtStations(segments), [segments]);
  const ix = indexCity(city);
  const starts = useMemo(() => {
    const m = new Map<string, LineId>();
    for (const l of city.lines) for (const s of l.starts) m.set(s, l.id);
    return m;
  }, [city]);
  const last = segments[segments.length - 1];
  const grow = useNarrow() && !zoomed && !mini ? 1.3 : 1;
  const symbolScale = (prefs.bigSymbols ? 1.22 : 1) * grow;

  return (
    <div className={`board${mini ? ' mini' : ''}`}>
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.w * ratio}`}
        role={mini ? 'img' : 'group'}
        aria-label={label}
        className={zoomed ? 'zoomed' : undefined}
        {...(mini
          ? {}
          : { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onPointerLeave: onPointerEnd })}
      >
        <BaseLayer city={city} mini={mini} />
        {segments.map((s) => (
          <Track key={s.edge} city={city} seg={s} dx={mini ? 6 : 0} fresh={!mini && s === last} />
        ))}
        {preview && activeLine && (
          <g className="preview" data-testid="preview">
            <line
              x1={ix.station.get(preview.from)!.x} y1={ix.station.get(preview.from)!.y}
              x2={ix.station.get(preview.to)!.x} y2={ix.station.get(preview.to)!.y}
              stroke={LINE_STYLE[activeLine].color} strokeWidth={11} strokeLinecap="round" strokeDasharray="2 17"
            />
          </g>
        )}
        {city.stations.map((s) => {
          const lines = [...(at.get(s.id) ?? [])];
          const start = starts.get(s.id);
          const isTarget = !!targets?.has(s.id);
          const isOrigin = !!origins?.has(s.id);
          const r = (s.hub ? 21 : s.landmark ? 19 : 16) * grow;
          const cls = [
            'station', isTarget && 'target', isOrigin && 'origin', origin === s.id && 'chosen', preview?.to === s.id && 'picked',
            lines.length > 1 && 'interchange', s.landmark && 'landmark', onStation && 'live',
          ].filter(Boolean).join(' ');
          return (
            <g
              key={s.id}
              className={cls}
              transform={`translate(${s.x} ${s.y})`}
              {...(onStation
                ? {
                    role: 'button', tabIndex: isTarget || isOrigin ? 0 : -1, 'data-station': s.id, 'aria-pressed': preview?.to === s.id,
                    'aria-label': stationLabel(s, city, t, lines, ''),
                    onClick: () => choose(s.id),
                    onKeyDown: (e: KeyboardEvent) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      moved.current = false;
                      choose(s.id);
                    },
                  }
                : {})}
            >
              {!mini && onStation && <circle r={30} className="hit" />}
              {isTarget && <circle r={r + 8} className="pulse" />}
              {isOrigin && <circle r={r + 6} className="origin-ring" />}
              {s.loop && <circle r={r + 4} className="loop-ring" />}
              {start && (
                <circle r={r + 5} className={`start-ring${start === activeLine ? ' active' : ''}`} stroke={LINE_STYLE[start].color} />
              )}
              {lines.length > 1 && lines.map((l, i) => <Arc key={l} r={r + 2.5} i={i} n={lines.length} color={LINE_STYLE[l].color} />)}
              {s.landmark ? (
                <path d={octagon(r)} className="body" />
              ) : (
                <circle r={r} className="body" />
              )}
              <SymbolPath symbol={s.symbol} scale={(s.landmark || s.hub ? 1.15 : 1) * symbolScale} className={`sym-fill sym-${s.symbol}`} />
              {s.stamp && !mini && (
                <g transform="translate(14 -14)">
                  <rect x={-8} y={-8} width={16} height={16} rx={3} className="stamp" />
                  <path d="M-4 1 L-1 4 L4 -4" className="stamp-mark" />
                </g>
              )}
              {start && !mini && (
                <g transform={`translate(${-r - 2} ${-r})`}>
                  <circle r={9} fill={LINE_STYLE[start].color} stroke="#fff6e4" strokeWidth={1.5} />
                  <text className="start-letter">{LINE_STYLE[start].letter}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {!mini && (
        <div className="zoom-controls">
          <button type="button" className="icon" onClick={() => zoomAt(0.75)} aria-label={t('zoomIn')} title={t('zoomIn')}>+</button>
          <button type="button" className="icon" onClick={() => zoomAt(1.34)} aria-label={t('zoomOut')} title={t('zoomOut')} disabled={!zoomed}>−</button>
          <button type="button" className="icon wide" onClick={() => setView(full)} disabled={!zoomed}>{t('zoomReset')}</button>
        </div>
      )}
    </div>
  );
}

function clampView(v: View, city: CityPack): View {
  const ratio = city.height / city.width;
  const w = Math.min(city.width, v.w);
  return {
    w,
    x: Math.min(Math.max(v.x, 0), city.width - w),
    y: Math.min(Math.max(v.y, 0), city.height - w * ratio),
  };
}

function octagon(r: number) {
  const k = r * 0.42;
  return `M${-k} ${-r} H${k} L${r} ${-k} V${k} L${k} ${r} H${-k} L${-r} ${k} V${-k} Z`;
}

/** One coloured slice of an interchange ring. */
function Arc({ r, i, n, color }: { r: number; i: number; n: number; color: string }) {
  const c = 2 * Math.PI * r;
  return (
    <circle
      r={r} fill="none" stroke={color} strokeWidth={6} strokeDasharray={`${c / n} ${c - c / n}`}
      transform={`rotate(${(360 / n) * i - 90})`}
    />
  );
}
