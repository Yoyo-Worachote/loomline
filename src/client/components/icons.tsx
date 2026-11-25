import type { Card, LineId, StationSymbol } from '../../engine/types';

/** Line colours. Each also has its own stitch pattern so colour is never the only cue. */
export const LINE_STYLE: Record<LineId, { color: string; deep: string; stitch: string | null; letter: string }> = {
  madder: { color: '#c2352b', deep: '#7c1d17', stitch: null, letter: 'M' },
  lapis: { color: '#1f5fc0', deep: '#123a78', stitch: '10 8', letter: 'L' },
  turmeric: { color: '#c27a06', deep: '#7a4b00', stitch: '1 9', letter: 'T' },
  plum: { color: '#7a3fa8', deep: '#4a2369', stitch: '14 5 2 5', letter: 'P' },
};

/** Symbol outline paths, drawn on a 20×20 grid centred on 0,0. */
const SHAPES: Record<StationSymbol, string> = {
  drop: 'M0 -9 C4 -3 7 0 7 3.5 A7 6.6 0 0 1 -7 3.5 C-7 0 -4 -3 0 -9 Z',
  leaf: 'M-7.5 7.5 C-9 -3 -2 -9 8.5 -8.5 C9 2 3 9 -7.5 7.5 Z',
  spark: 'M0 -9.5 L2.6 -2.6 L9.5 0 L2.6 2.6 L0 9.5 L-2.6 2.6 L-9.5 0 L-2.6 -2.6 Z',
  hex: 'M-4.6 -8 L4.6 -8 L9.2 0 L4.6 8 L-4.6 8 L-9.2 0 Z',
  any: 'M0 0 C-7 -3 -6 -10 0 -10 C6 -10 7 -3 0 0 C3 -7 10 -6 10 0 C10 6 3 7 0 0 C7 3 6 10 0 10 C-6 10 -7 3 0 0 C-3 7 -10 6 -10 0 C-10 -6 -3 -7 0 0 Z',
};

export function SymbolPath({ symbol, scale = 1, className }: { symbol: StationSymbol; scale?: number; className?: string }) {
  return (
    <g transform={`scale(${scale})`} className={className}>
      <path d={SHAPES[symbol]} />
      {symbol === 'leaf' && <path d="M-7 7 L4 -4" className="vein" />}
    </g>
  );
}

export function SymbolIcon({ symbol, size = 24 }: { symbol: StationSymbol; size?: number }) {
  return (
    <svg className={`sym sym-${symbol}`} width={size} height={size} viewBox="-11 -11 22 22" aria-hidden="true">
      <SymbolPath symbol={symbol} />
    </svg>
  );
}

export function LineSwatch({ line, width = 44 }: { line: LineId; width?: number }) {
  const s = LINE_STYLE[line];
  return (
    <svg className="swatch" width={width} height={14} viewBox={`0 0 ${width} 14`} aria-hidden="true">
      <line x1={6} y1={7} x2={width - 6} y2={7} stroke={s.deep} strokeWidth={12} strokeLinecap="round" />
      <line x1={6} y1={7} x2={width - 6} y2={7} stroke={s.color} strokeWidth={9} strokeLinecap="round" />
      {s.stitch && <line x1={6} y1={7} x2={width - 6} y2={7} stroke="#fff6e4" strokeWidth={2.6} strokeLinecap="round" strokeDasharray={s.stitch} />}
    </svg>
  );
}

/** Which instruction family a card belongs to. */
export function cardType(c: Card): 'symbol' | 'wild' | 'branch' | 'double' | 'overpass' | 'tunnel' {
  if (c.kind === 'symbol' || c.kind === 'wild' || c.kind === 'branch') return c.kind;
  return c.segments && c.segments > 1 ? 'double' : c.overpass ? 'overpass' : 'tunnel';
}

/** Original line-art for each card family. */
export function CardGlyph({ card }: { card: Card }) {
  const type = cardType(card);
  return (
    <svg viewBox="-40 -40 80 80" className="card-glyph" aria-hidden="true">
      {type === 'symbol' && <SymbolPath symbol={card.symbol} scale={2.7} className={`sym-fill sym-${card.symbol}`} />}
      {type === 'wild' && <SymbolPath symbol="any" scale={2.7} className="sym-fill sym-any" />}
      {type === 'branch' && (
        <g className="glyph-line">
          <path d="M-30 18 H30" />
          <path d="M-6 18 C6 18 6 -8 24 -20" />
          <circle cx="-6" cy="18" r="6" />
        </g>
      )}
      {type === 'double' && (
        <g className="glyph-line">
          <path d="M-30 12 L0 -12 L30 12" />
          <circle cx="-30" cy="12" r="6" />
          <circle cx="0" cy="-12" r="6" />
          <circle cx="30" cy="12" r="6" />
        </g>
      )}
      {type === 'overpass' && (
        <g className="glyph-line">
          <path d="M0 -30 V-12 M0 12 V30" />
          <path d="M-32 10 C-14 10 -14 -6 0 -6 C14 -6 14 10 32 10" />
        </g>
      )}
      {type === 'tunnel' && (
        <g className="glyph-line">
          <path d="M-26 24 V2 A26 26 0 0 1 26 2 V24" />
          <path d="M-12 24 V6 A12 12 0 0 1 12 6 V24" strokeDasharray="5 5" />
        </g>
      )}
    </svg>
  );
}

const SPOOLS = [
  ['#c2352b', 0], ['#1f5fc0', 1], ['#c27a06', 2], ['#7a3fa8', 3], ['#2c7a55', 1], ['#3b4a78', 2], ['#a8446b', 3], ['#5d6b1c', 0],
] as const;

/** Players are represented by thread spools. */
export function Avatar({ n, size = 36 }: { n: number; size?: number }) {
  const [color, pattern] = SPOOLS[((n % SPOOLS.length) + SPOOLS.length) % SPOOLS.length]!;
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="9" y="3" width="22" height="6" rx="3" fill="#8a6540" />
      <rect x="9" y="31" width="22" height="6" rx="3" fill="#8a6540" />
      <rect x="12" y="8" width="16" height="24" rx="3" fill={color} />
      <g stroke="#fff6e4" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" fill="none">
        {pattern === 0 && [13, 18, 23, 28].map((y) => <path key={y} d={`M13 ${y} H27`} />)}
        {pattern === 1 && [12, 18, 24].map((y) => <path key={y} d={`M13 ${y} L27 ${y + 5}`} />)}
        {pattern === 2 && [13, 20, 27].map((y) => <path key={y} d={`M13 ${y} L20 ${y - 4} L27 ${y}`} />)}
        {pattern === 3 && [13, 20, 27].map((y) => <path key={y} d={`M14 ${y} H14.1 M20 ${y} H20.1 M26 ${y} H26.1`} strokeWidth="3" />)}
      </g>
    </svg>
  );
}

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="1" y="1" width="46" height="46" rx="10" fill="#f5eedf" />
      <g strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M8 16 H40" stroke="#c2352b" />
        <path d="M8 32 H40" stroke="#1f5fc0" />
        <path d="M16 8 V13 M16 19 V40" stroke="#c27a06" />
        <path d="M32 8 V29 M32 35 V40" stroke="#7a3fa8" />
      </g>
    </svg>
  );
}

/** Small original scenes for the gallery. */
export function CityArt({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 320 150" className="city-art" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {id === 'london' && (
        <>
          <rect width="320" height="150" fill="#d9dfe6" />
          <path d="M0 92 C60 70 100 112 170 92 S280 78 320 96 V150 H0 Z" fill="#6f9cc4" />
          <path d="M0 108 C60 88 110 128 180 108 S290 96 320 112" stroke="#f5eedf" strokeWidth="2" strokeDasharray="10 8" fill="none" />
          <g fill="#2b355c">
            <path d="M56 92 V34 L64 14 L72 34 V92 Z" />
            <path d="M96 94 V62 H116 V94 Z M120 96 V48 A14 14 0 0 1 148 48 V96 Z" />
            <path d="M226 92 V58 L234 48 L242 58 V92 Z M282 92 V58 L290 48 L298 58 V92 Z" />
          </g>
          <circle cx="64" cy="44" r="5.5" fill="#f2c14b" />
          <path d="M196 84 C214 84 226 66 234 60 C254 92 270 92 290 60 C298 66 308 84 320 84" stroke="#c2352b" strokeWidth="4" fill="none" />
          <path d="M190 88 H320" stroke="#2b355c" strokeWidth="5" />
        </>
      )}
      {id === 'tokyo' && (
        <>
          <rect width="320" height="150" fill="#f3d9cf" />
          <path d="M20 120 L92 40 L112 60 L128 46 L200 120 Z" fill="#6c7fae" />
          <path d="M72 62 L92 40 L112 60 L102 58 L92 66 L84 58 Z" fill="#fff6e4" />
          <circle cx="246" cy="52" r="26" fill="#c2352b" />
          <g fill="none" stroke="#2b355c" strokeWidth="4">
            <ellipse cx="180" cy="122" rx="118" ry="22" />
            <ellipse cx="180" cy="122" rx="70" ry="12" stroke="#c27a06" strokeDasharray="9 7" />
          </g>
          {[62, 118, 242, 298].map((x) => <circle key={x} cx={x} cy={x < 100 || x > 280 ? 122 : x < 200 ? 103 : 104} r="6" fill="#fff6e4" stroke="#2b355c" strokeWidth="3" />)}
          <path d="M286 10 V26 M274 30 Q286 22 298 30 V48 Q286 56 274 48 Z" fill="#f2c14b" stroke="#7a4b00" strokeWidth="3" />
        </>
      )}
      {id === 'paris' && (
        <>
          <rect width="320" height="150" fill="#e3dcf0" />
          <path d="M0 112 Q160 70 320 112 V150 H0 Z" fill="#7fa6c9" />
          <g fill="none" stroke="#2b355c" strokeWidth="5">
            <path d="M34 106 Q62 72 90 99 M130 92 Q160 62 190 92 M230 99 Q258 72 286 106" />
          </g>
          <path d="M20 102 Q160 60 300 102" stroke="#7a3fa8" strokeWidth="5" fill="none" />
          <path d="M152 82 Q166 48 168 10 Q170 48 184 82" stroke="#7a4b00" strokeWidth="5" fill="none" />
          <path d="M159 60 H177 M163 40 H173 M156 74 L180 60 M180 74 L156 60" stroke="#7a4b00" strokeWidth="2.5" />
          <path d="M244 78 V52 A18 18 0 0 1 280 52 V78 Z M60 80 V56 H92 V80 M60 56 L76 42 L92 56" fill="#fff6e4" stroke="#2b355c" strokeWidth="3" />
        </>
      )}
      {id === 'berlin' && (
        <>
          <rect width="320" height="150" fill="#dde6d4" />
          <path d="M0 60 C80 40 120 150 320 108 V132 C120 170 70 70 0 86 Z" fill="#7fa6c9" />
          <g stroke="#b9c4ac" strokeWidth="2">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <path key={i} d={`M${i * 50 - 40} 150 L${i * 50 + 60} 0 M${i * 50 - 40} 0 L${i * 50 + 60} 150`} />)}
          </g>
          <path d="M44 112 L92 66 L150 92 L208 44 L276 70" stroke="#123a78" strokeWidth="11" fill="none" strokeLinejoin="round" />
          <path d="M44 112 L92 66 L150 92 L208 44 L276 70" stroke="#1f5fc0" strokeWidth="8" fill="none" strokeLinejoin="round" />
          <path d="M44 112 L92 66 L150 92 L208 44 L276 70" stroke="#fff6e4" strokeWidth="2.4" strokeDasharray="10 8" fill="none" />
          {[[44, 112], [276, 70]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="13" fill="#fff6e4" stroke="#c2352b" strokeWidth="6" />)}
          <path d="M236 118 V40 M228 40 A8 8 0 1 1 244 40 A8 8 0 1 1 228 40 M236 32 V14" stroke="#2b355c" strokeWidth="4" fill="#f2c14b" />
        </>
      )}
    </svg>
  );
}
