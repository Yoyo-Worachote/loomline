/** Developer aid: prints map statistics and writes an SVG proof of each board to the given folder. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CITIES } from '../src/cities';
import { indexCity } from '../src/engine/network';
import { dist } from '../src/engine/geometry';

const out = process.argv[2];
const COLORS: Record<string, string> = { drop: '#1c5fb8', leaf: '#2c8a4b', spark: '#c2352b', hex: '#6b3fa0', any: '#222' };
for (const c of CITIES) {
  const ix = indexCity(c);
  const counts: Record<string, number> = {};
  for (const s of c.stations) counts[s.symbol] = (counts[s.symbol] ?? 0) + 1;
  const deg = c.stations.map((s) => ix.adj.get(s.id)!.length);
  let close = Infinity;
  for (const a of c.stations) for (const b of c.stations) if (a !== b) close = Math.min(close, dist(a, b));
  console.log(
    c.id, 'stations', c.stations.length, 'edges', c.edges.length, 'deg', Math.min(...deg), Math.max(...deg),
    'minGap', close.toFixed(0), 'river', c.edges.filter((e) => e.river).length, 'bridge', c.edges.filter((e) => e.bridge).length,
    'tunnel', c.edges.filter((e) => e.tunnel).length, JSON.stringify(counts),
  );
  console.log('  districts', c.districts.map((d) => `${d.id}:${c.stations.filter((s) => s.district === d.id).length}`).join(' '));
  for (const l of c.lines) for (const s of l.starts) if (!ix.station.has(s)) console.log('  MISSING start', l.id, s);
  if (!out) continue;
  mkdirSync(out, { recursive: true });
  const st = ix.station;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.width} ${c.height}" width="1000" font-family="sans-serif"><rect width="100%" height="100%" fill="#f4ecdc"/>
${c.districts.map((d, i) => `<polygon points="${d.polygon.map((p) => `${p.x},${p.y}`).join(' ')}" fill="hsl(${(i * 47) % 360} 40% 85%)" stroke="#999"/><text x="${d.label.x}" y="${d.label.y}" font-size="11" text-anchor="middle">${d.name.en}</text>`).join('')}
${c.river ? `<polyline points="${c.river.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#8fb8d8" stroke-width="22"/>` : ''}
${c.edges.map((e) => `<line x1="${st.get(e.a)!.x}" y1="${st.get(e.a)!.y}" x2="${st.get(e.b)!.x}" y2="${st.get(e.b)!.y}" stroke="${e.bridge ? '#c60' : e.tunnel ? '#06c' : '#777'}" stroke-width="${e.bridge ? 4 : 1}" ${e.tunnel ? 'stroke-dasharray="5 4"' : ''}/>`).join('')}
${c.stations.map((s) => `<circle cx="${s.x}" cy="${s.y}" r="${s.landmark ? 13 : 9}" fill="${COLORS[s.symbol]}" stroke="${s.stamp ? 'gold' : s.loop ? 'lime' : '#fff'}" stroke-width="3"/><text x="${s.x}" y="${s.y - 13}" font-size="11" text-anchor="middle">${s.id}</text>`).join('')}
${c.lines.map((l) => l.starts.map((id) => `<circle cx="${st.get(id)!.x}" cy="${st.get(id)!.y}" r="17" fill="none" stroke="${{ madder: 'red', lapis: 'blue', turmeric: 'orange', plum: 'purple' }[l.id]}" stroke-width="4"/>`).join('')).join('')}</svg>`;
  writeFileSync(join(out, `${c.id}.svg`), svg);
}
