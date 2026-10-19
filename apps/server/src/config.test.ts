import { it, expect } from "vitest";
import { loadConfig } from "./config.js";
it("requires explicit opt-in and loopback binding for synthetic responses", () => {
  expect(() =>
    loadConfig({ INVITE_CODE: "test-only-invitation", AI_PROVIDER: "test" }),
  ).toThrow();
  expect(() =>
    loadConfig({
      INVITE_CODE: "test-only-invitation",
      AI_PROVIDER: "test",
      ALLOW_TEST_PROVIDER: "true",
      HOST: "0.0.0.0",
    }),
  ).toThrow();
});
it("refuses incomplete model credentials and insecure remote endpoints", () => {
  expect(() =>
    loadConfig({ INVITE_CODE: "test-only-invitation", AI_PROVIDER: "openai" }),
  ).toThrow();
  expect(() =>
    loadConfig({
      INVITE_CODE: "test-only-invitation",
      MODEL_API_BASE: "http://evil.test/v1",
    }),
  ).toThrow();
});
