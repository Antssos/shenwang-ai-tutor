import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rateLimit.js";

describe("createRateLimiter", () => {
  it("limits each key independently and resets after the window", () => {
    vi.useFakeTimers();
    const consume = createRateLimiter(2, 1000);

    expect(consume("client-a")).toBe(true);
    expect(consume("client-a")).toBe(true);
    expect(consume("client-a")).toBe(false);
    expect(consume("client-b")).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(consume("client-a")).toBe(true);
    vi.useRealTimers();
  });
});
