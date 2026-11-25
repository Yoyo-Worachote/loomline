/** Plays many bot games per city and prints balance figures. Usage: npm run simulate -- [games] */
import { CITIES } from '../src/cities';
import { playBotGame } from '../src/engine/bot';

const games = Number(process.argv[2] ?? 60);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
for (const city of CITIES)
  for (const skill of ['random', 'greedy'] as const) {
    const totals: number[] = [];
    const segs: number[] = [];
    const parts = new Map<string, number[]>();
    const lineTotals: number[] = [];
    for (let i = 0; i < games; i++) {
      const s = playBotGame(city, `sim-${i}`, 2, skill, []);
      for (const p of Object.values(s.players)) {
        totals.push(p.final!.total);
        segs.push(p.segments.length);
        lineTotals.push(...p.lineScores.map((l) => l.total));
        for (const x of p.final!.parts) parts.set(x.rule, [...(parts.get(x.rule) ?? []), x.points]);
      }
    }
    console.log(
      city.id.padEnd(7), skill.padEnd(7), 'total', mean(totals).toFixed(1), `[${Math.min(...totals)}..${Math.max(...totals)}]`,
      'segments', mean(segs).toFixed(1), 'line', mean(lineTotals).toFixed(1),
      [...parts].map(([k, v]) => `${k}=${mean(v).toFixed(1)}`).join(' '),
    );
  }
