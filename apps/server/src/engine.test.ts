import { afterEach, describe, it, expect, vi } from "vitest";
import { loadConfig } from "./config.js";
import { AppStore } from "./store.js";
import { Engine } from "./engine.js";
import type { Route } from "@wangxueban/contracts";
const stores: AppStore[] = [];
afterEach(() => {
  stores.forEach((s) => s.close());
  stores.length = 0;
});
describe("routing policy independently of model accuracy", () => {
  it.each([
    ["study_question", "learning"],
    ["center_information", "center-public"],
    ["emotional_support", "care-support"],
    ["general_chat", null],
    ["safety_risk", null],
    ["unsupported", null],
  ] as [Route, string | null][])(
    "runs %s only against its configured knowledge base",
    async (route, base) => {
      const c = loadConfig({
          INVITE_CODE: "test-only-invitation",
          DATABASE_PATH: ":memory:",
          AI_PROVIDER: "test",
          ALLOW_TEST_PROVIDER: "true",
        }),
        s = new AppStore(":memory:");
      stores.push(s);
      const engine = new Engine(c, s),
        u = (await s.createUser("user", "password-123"))!,
        r = s.beginRun(u.id, {
          message: "一个普通的问题",
          conversationId: "",
          requestId: "r",
        });
      vi.spyOn(engine.provider, "classify").mockResolvedValue(route);
      const search = vi.spyOn(engine.knowledge, "search").mockResolvedValue([
        {
          content: "合成资料",
          source: { title: "合成来源", documentId: "fixture" },
        },
      ]);
      const result = await engine.prepare(
        r.conversationId,
        new AbortController().signal,
      );
      expect(result.route).toBe(route);
      if (base) expect(search.mock.calls[0][1]).toBe(base);
      else expect(search).not.toHaveBeenCalled();
      if (["safety_risk", "unsupported"].includes(route))
        expect(result.fixed).toBeTruthy();
    },
  );
  it("fails safely when classification is unavailable and rejects unsupported evidence", async () => {
    const c = loadConfig({
        INVITE_CODE: "test-only-invitation",
        DATABASE_PATH: ":memory:",
        AI_PROVIDER: "test",
        ALLOW_TEST_PROVIDER: "true",
      }),
      s = new AppStore(":memory:");
    stores.push(s);
    const engine = new Engine(c, s),
      u = (await s.createUser("user", "password-123"))!,
      r = s.beginRun(u.id, {
        message: "中心提供什么课程",
        conversationId: "",
        requestId: "r",
      });
    const classify = vi
      .spyOn(engine.provider, "classify")
      .mockRejectedValue(new Error("unavailable"));
    expect(
      (await engine.prepare(r.conversationId, new AbortController().signal))
        .fixed,
    ).toContain("无法可靠判断");
    classify.mockResolvedValue("center_information");
    expect(
      (await engine.prepare(r.conversationId, new AbortController().signal))
        .fixed,
    ).toContain("没有找到");
  });
});
it("uses bounded prior user context for an elliptical follow-up without inventing a rewritten topic", async () => {
  const { retrievalQuery } = await import("./engine.js");
  expect(
    retrievalQuery([
      { role: "user", content: "中心五子棋课程什么时候开放" },
      { role: "assistant", content: "周六开放" },
      { role: "user", content: "那周日呢" },
    ]),
  ).toBe("中心五子棋课程什么时候开放 那周日呢");
  expect(
    retrievalQuery([
      { role: "user", content: "旧话题" },
      { role: "user", content: "银行卡号是什么" },
    ]),
  ).toBe("银行卡号是什么");
});
