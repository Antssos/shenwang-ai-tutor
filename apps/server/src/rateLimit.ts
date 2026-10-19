export function createRateLimiter(limit: number, windowMs: number) {
  const entries = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const now = Date.now();
    for (const [k, v] of entries) if (v.resetAt <= now) entries.delete(k);
    const value = entries.get(key);
    if (!value) {
      if (entries.size >= 10000) return false;
      entries.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (value.count >= limit) return false;
    value.count++;
    return true;
  };
}
export const createMinuteRateLimiter = (limit: number) =>
  createRateLimiter(limit, 60000);
