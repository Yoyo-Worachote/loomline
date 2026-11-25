/** Fixed-window rate limiter. */
export class RateLimiter {
  private readonly windows = new Map<unknown, { start: number; count: number }>();
  constructor(private readonly max: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  take(key: unknown): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      return true;
    }
    w.count++;
    return w.count <= this.max;
  }

  forget(key: unknown) {
    this.windows.delete(key);
  }

  prune() {
    const t = this.now();
    for (const [k, w] of this.windows) if (t - w.start >= this.windowMs) this.windows.delete(k);
  }
}
