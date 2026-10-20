import { it, expect } from "vitest";
import { AppStore } from "./store.js";
it("rejects edits, full conversations and failed inserts without spending quota; accepts each key once", async () => {
  const s = new AppStore(":memory:");
  try {
    const user = (await s.createUser("atomic-user", "test-password"))!,
      quota = {
        tokens: 100,
        requests: 10,
        userBudget: 10000,
        globalBudget: 10000,
      };
    const first = s.admit(
      user.id,
      { message: "你好", conversationId: "", requestId: "first" },
      quota,
    );
    s.finish(first, "你好", "complete", [], "general_chat");
    const snapshot = () =>
      JSON.stringify(
        s.db.prepare("SELECT * FROM quotas ORDER BY subject").all(),
      );
    const before = snapshot();
    expect(() =>
      s.admit(
        user.id,
        {
          message: "修改",
          conversationId: first.conversationId,
          requestId: "bad-edit",
          editMessageId: "missing",
        },
        quota,
      ),
    ).toThrow();
    expect(snapshot()).toBe(before);
    expect(() =>
      s.admit(
        user.id,
        { message: "重复", conversationId: "", requestId: "first" },
        quota,
      ),
    ).toThrow("DUPLICATE_REQUEST");
    expect(snapshot()).toBe(before);
    for (let i = 2; i < 200; i++)
      s.db
        .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?)")
        .run("m" + i, first.conversationId, i, "user", "x", "complete", "[]");
    expect(() =>
      s.admit(
        user.id,
        {
          message: "满了",
          conversationId: first.conversationId,
          requestId: "full",
        },
        quota,
      ),
    ).toThrow("CONVERSATION_FULL");
    expect(snapshot()).toBe(before);
    s.db.exec(
      "CREATE TRIGGER fail_run BEFORE INSERT ON runs BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
    );
    expect(() =>
      s.admit(
        user.id,
        { message: "失败", conversationId: "", requestId: "insert-failure" },
        quota,
      ),
    ).toThrow();
    expect(snapshot()).toBe(before);
    s.db.exec("DROP TRIGGER fail_run");
    expect(() =>
      s.admit(
        user.id,
        { message: "超限", conversationId: "", requestId: "budget" },
        { ...quota, userBudget: 1 },
      ),
    ).toThrow("QUOTA_EXCEEDED");
    expect(snapshot()).toBe(before);
    expect(s.priorRun(user.id, "budget")).toBeUndefined();
    expect(s.db.prepare("SELECT count(*) n FROM conversations").get()!.n).toBe(
      1,
    );
  } finally {
    s.close();
  }
});
