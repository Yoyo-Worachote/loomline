import { getPrefs } from './prefs';

let ctx: AudioContext | null = null;

/** Short synthesised cues; no audio files. [frequency Hz, start s, length s] */
const CUES = {
  card: [[392, 0, 0.09], [523, 0.08, 0.14]],
  build: [[294, 0, 0.07], [440, 0.06, 0.12]],
  pass: [[262, 0, 0.12]],
  deny: [[185, 0, 0.14]],
  round: [[392, 0, 0.12], [494, 0.11, 0.12], [587, 0.22, 0.24]],
} as const;

export function play(cue: keyof typeof CUES) {
  if (!getPrefs().sound || typeof AudioContext === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    for (const [f, at, len] of CUES[cue]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime + at;
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + len + 0.02);
    }
  } catch {
    /* audio is optional */
  }
}
