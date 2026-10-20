import { it, expect } from "vitest";
import { clientAddress, createFailureLimiter } from "./clientIdentity.js";
it("ignores forged identity outside a configured ingress and rejects chained headers", () => {
  expect(clientAddress("198.51.100.10", "203.0.113.1", ["127.0.0.1"])).toBe(
    "198.51.100.10",
  );
  expect(
    clientAddress("127.0.0.1", "203.0.113.1,203.0.113.2", ["127.0.0.1"]),
  ).toBe("127.0.0.1");
  expect(clientAddress("::ffff:127.0.0.1", "203.0.113.1", ["127.0.0.1"])).toBe(
    "203.0.113.1",
  );
  expect(clientAddress("127.0.0.1", "203.0.113.2", ["127.0.0.1"])).toBe(
    "203.0.113.2",
  );
});
it("tracks per-account failures independently of a shared client address", () => {
  const l = createFailureLimiter(2, 60000);
  l.fail("login:one");
  l.fail("login:one");
  expect(l.allowed("login:one")).toBe(false);
  expect(l.allowed("login:two")).toBe(true);
});
