import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppStore } from "./store.js";
describe("server-owned persistence", () => {
  it("isolates users, preserves edit ancestry and idempotency across restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wx-store-")),
      path = join(dir, "db.sqlite");
    let s = new AppStore(path);
    try {
      const a = (await s.createUser("first", "password-123"))!,
        b = (await s.createUser("second", "password-456"))!;
      const one = s.beginRun(a.id, {
        message: "我喜欢苹果",
        conversationId: "",
        requestId: "r1",
      });
      s.finish(one, "记住了", "complete", [], "general_chat");
      const two = s.beginRun(a.id, {
        message: "你还记得吗",
        conversationId: one.conversationId,
        requestId: "r2",
      });
      s.finish(two, "记得", "complete", [], "general_chat");
      const edit = s.beginRun(a.id, {
        message: "请再说一遍",
        conversationId: one.conversationId,
        editMessageId: two.userMessageId,
        requestId: "r3",
      });
      expect(s.messages(edit.conversationId).map((m) => m.content)).toEqual([
        "我喜欢苹果",
        "记住了",
        "请再说一遍",
        "",
      ]);
      expect(s.conversation(b.id, one.conversationId)).toBeNull();
      expect(() =>
        s.beginRun(b.id, {
          message: "x",
          conversationId: one.conversationId,
          requestId: "attack",
        }),
      ).toThrow();
      expect(s.reserve(a.id, 10, 1, 100, 100)).toBe(true);
      s.close();
      s = new AppStore(path);
      expect(s.reserve(a.id, 10, 1, 100, 100)).toBe(false);
      expect(s.priorRun(a.id, "r1")).toBeTruthy();
      s.recover();
      expect(s.messages(edit.conversationId).at(-1)?.status).toBe("error");
    } finally {
      s.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
