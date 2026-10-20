import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppStore } from "./store.js";
import { Knowledge } from "./knowledge.js";
it("invalidates in-flight retrieval on retirement or reimport and preserves operator decisions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "publication-")),
    store = new AppStore(":memory:"),
    k = new Knowledge(store);
  try {
    writeFileSync(
      join(dir, "doc.md"),
      "# 中心课程\n中心的五子棋课程在周六开放。",
    );
    const manifest = join(dir, "manifest.csv");
    const load = async (
      version = "v1",
      base = "center-public",
      model = "fixture",
      dim = 2,
    ) => {
      writeFileSync(
        manifest,
        `doc_id,clean_file,title,knowledge_base,status,version\ncenter,doc.md,中心课程,${base},active,${version}\n`,
      );
      return k.import(
        dir,
        manifest,
        async (ts) =>
          ts.map(() =>
            Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0)),
          ),
        model,
        "fixture-provider",
      );
    };
    await load();
    const original = k.version();
    const pending = k.search("五子棋", "center-public", [1, 0], "fixture");
    k.publish("center", false);
    expect(await pending).toEqual([]);
    expect(k.version()).not.toBe(original);
    const retired = k.version();
    await load();
    expect(k.documents()[0].status).toBe("retired");
    expect(k.version()).toBe(retired);
    k.publish("center", true);
    expect(k.version()).toBe(original);
    const removed = k.search("五子棋", "center-public", [1, 0], "fixture");
    await load("v2", "learning");
    expect(await removed).toEqual([]);
    expect(k.version()).not.toBe(original);
    const next = k.version();
    await load("v2", "learning", "fixture-v2", 3);
    expect(k.version()).not.toBe(next);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("content identity does not depend on manifest order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "identity-")),
    s = new AppStore(":memory:"),
    k = new Knowledge(s);
  try {
    writeFileSync(join(dir, "doc.md"), "# 合成资料\n五子棋课程。");
    const h = "doc_id,clean_file,title,knowledge_base,status,version\n",
      a = "a,doc.md,甲,learning,active,v1\n",
      b = "b,doc.md,乙,center-public,active,v1\n";
    const path = join(dir, "manifest.csv");
    writeFileSync(path, h + a + b);
    await k.import(dir, path);
    const version = k.version();
    writeFileSync(path, h + b + a);
    await k.import(dir, path);
    expect(k.version()).toBe(version);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
