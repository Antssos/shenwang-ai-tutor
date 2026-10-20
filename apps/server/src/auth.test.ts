import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./auth.js";

describe("account security helpers", () => {
  it("verifies the correct password without retaining plaintext", async () => {
    const stored = await hashPassword("a-secure-password");
    expect(stored.hash).not.toContain("a-secure-password");
    expect(
      await verifyPassword("a-secure-password", stored.salt, stored.hash),
    ).toBe(true);
    expect(
      await verifyPassword("incorrect-password", stored.salt, stored.hash),
    ).toBe(false);
  });

  it("hashes session tokens and compares invitation codes safely", () => {
    expect(hashSessionToken("session-token")).not.toBe("session-token");
    expect(constantTimeEqual("test-invite-code", "test-invite-code")).toBe(
      true,
    );
    expect(constantTimeEqual("test-invite-code", "incorrect-code")).toBe(false);
  });
});
