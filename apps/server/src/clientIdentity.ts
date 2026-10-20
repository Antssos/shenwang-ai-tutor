import { isIP } from "node:net";
// Trust only an exact direct-peer address and an ingress-overwritten, single-IP header.
export function clientAddress(
  peer: string,
  realIp: string | undefined,
  trustedPeers: string[],
) {
  const normalize = (value: string) =>
    value.startsWith("::ffff:") && isIP(value.slice(7)) === 4
      ? value.slice(7)
      : value;
  const direct = normalize(peer),
    candidate = realIp?.trim();
  if (
    trustedPeers.map(normalize).includes(direct) &&
    candidate &&
    isIP(candidate)
  )
    return normalize(candidate);
  return direct;
}
export function createFailureLimiter(limit: number, windowMs: number) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  function current(key: string) {
    const now = Date.now();
    for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
    return failures.get(key);
  }
  return {
    allowed(key: string) {
      const value = current(key);
      return !value ? failures.size < 10000 : value.count < limit;
    },
    fail(key: string) {
      const value = current(key);
      if (value) value.count++;
      else if (failures.size < 10000)
        failures.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
  };
}
