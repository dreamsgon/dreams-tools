/** A small per-key limit: at most `limit` hits in any `windowMs`. Kept in memory, so it is a brake on one server, not a ledger. */
export function createThrottle(limit: number, windowMs: number) {
  const recent = new Map<string, number[]>();
  return {
    /** True when `key` has used up its hits; otherwise counts this one. */
    hit(key: string, now = Date.now()) {
      const times = (recent.get(key) ?? []).filter(t => now - t < windowMs);
      if (times.length >= limit) { recent.set(key, times); return true; }
      times.push(now); recent.set(key, times);
      if (recent.size > 5000) for (const [k, v] of recent) if (!v.some(t => now - t < windowMs)) recent.delete(k);
      return false;
    },
    reset() { recent.clear(); },
  };
}
