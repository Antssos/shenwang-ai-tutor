import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppStore } from "./store.js";
import { Knowledge } from "./knowledge.js";
describe("knowledge publishing and retrieval", () => {
  it("indexes only approved documents, isolates knowledge bases, supports unpublishing and semantic search", async () => {
    const root = mkdtempSync(join(tmpdir(), "wx-knowledge-")),
      store = new AppStore(":memory:"),
      kb = new Knowledge(store);
    try {
      mkdirSync(join(root, "docs"));
      writeFileSync(
        join(root, "docs/center.md"),
        "# 中心课程\n中心的五子棋课程在周六开放。",
      );
      writeFileSync(
        join(root, "docs/study.md"),
        "# 苹果学习\n苹果算术课程教加法。",
      );
      writeFileSync(
        join(root, "manifest.csv"),
        "doc_id,clean_file,title,knowledge_base,status,version\r\ncenter,docs/center.md,中心课程,center-public,active,v1\nstudy,docs/study.md,苹果学习,learning,active,v1\ndraft,absent.md,未审核,learning,draft,v1\n",
      );
      const imported = await kb.import(
        root,
        join(root, "manifest.csv"),
        async (texts) =>
          texts.map((t) => (t.includes("五子棋") ? [1, 0] : [0, 1])),
        "fixture",
      );
      expect(imported.documents).toBe(2);
      const result = await kb.search("五子棋课程", "center-public");
      expect(result[0].source.documentId).toBe("center");
      expect(await kb.search("五子棋", "learning")).toEqual([]);
      expect(
        await kb.search("不可匹配词", "center-public", [1, 0], "fixture"),
      ).toEqual([]);
      expect(
        (await kb.search("水果", "learning", [0, 1], "fixture"))[0].source
          .documentId,
      ).toBe("study");
      expect(
        await kb.search(
          "中心的收款银行卡号是什么",
          "center-public",
          [1, 0],
          "fixture",
        ),
      ).toEqual([]);
      kb.publish("center", false);
      expect(await kb.search("五子棋课程", "center-public")).toEqual([]);
      expect(kb.documents()).toHaveLength(2);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects manifest paths outside the knowledge root", async () => {
    const root = mkdtempSync(join(tmpdir(), "wx-path-")),
      store = new AppStore(":memory:");
    try {
      writeFileSync(
        join(root, "manifest.csv"),
        "doc_id,clean_file,title,knowledge_base,status\nx,../../etc/passwd,x,learning,active\n",
      );
      await expect(
        new Knowledge(store).import(root, join(root, "manifest.csv")),
      ).rejects.toThrow();
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
it("recovers relevant context for an elliptical question while rejecting an unrelated institution fact", async () => {
  const root = mkdtempSync(join(tmpdir(), "wx-evidence-")),
    s = new AppStore(":memory:"),
    kb = new Knowledge(s);
  try {
    writeFileSync(
      join(root, "doc.md"),
      "# 中心课程\n中心五子棋课程在周六开放。",
    );
    writeFileSync(
      join(root, "manifest.csv"),
      "doc_id,clean_file,title,knowledge_base,status,version\ncenter,doc.md,中心课程,center-public,active,v1\n",
    );
    await kb.import(root, join(root, "manifest.csv"));
    expect(
      await kb.search("中心的收款银行卡号是什么", "center-public"),
    ).toEqual([]);
    expect(
      (
        await kb.search("中心五子棋课程什么时候开放 那周日呢", "center-public")
      )[0].retrieval?.coverage,
    ).toBeGreaterThanOrEqual(0.5);
  } finally {
    s.close();
    rmSync(root, { recursive: true, force: true });
  }
});
