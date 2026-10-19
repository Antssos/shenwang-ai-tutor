interface RateEntry {
  count: number
  resetAt: number
}

export function createRateLimiter(limit: number, windowMs: number) {
  const entries = new Map<string, RateEntry>()

  return function consume(key: string) {
    const now = Date.now()
    const current = entries.get(key)
    if (!current || current.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (current.count >= limit) return false
    current.count += 1
    return true
  }
}

export function createMinuteRateLimiter(limit: number) {
  return createRateLimiter(limit, 60_000)
}
