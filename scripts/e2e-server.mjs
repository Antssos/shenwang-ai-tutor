// Synthetic data only. This server can never be used as the real AI provider.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { loadConfig } from "../apps/server/dist/config.js";
import { AppStore } from "../apps/server/dist/store.js";
import { Knowledge } from "../apps/server/dist/knowledge.js";
import { createApp } from "../apps/server/dist/app.js";
const dir = mkdtempSync(join(tmpdir(), "wangxueban-e2e-"));
const c = loadConfig({
  INVITE_CODE: "test-only-invitation",
  DATABASE_PATH: join(dir, "db.sqlite"),
  AI_PROVIDER: "test",
  ALLOW_TEST_PROVIDER: "true",
  DAILY_TOKEN_BUDGET: "10000000",
  GLOBAL_DAILY_TOKEN_BUDGET: "20000000",
  PORT: "3000",
});
const store = new AppStore(c.DATABASE_PATH, c.root);
const admin = await store.createUser("testadmin", "test-password-123");
store.db.prepare("UPDATE users SET admin=1 WHERE id=?").run(admin.id);
writeFileSync(
  join(dir, "center.md"),
  "# 测试中心课程\n本测试中心的五子棋课程每周六开放。此为合成测试资料。",
);
writeFileSync(
  join(dir, "manifest.csv"),
  "doc_id,clean_file,title,knowledge_base,status,version\nfixture-center,center.md,测试中心课程,center-public,active,v1\n",
);
await new Knowledge(store).import(dir, join(dir, "manifest.csv"));
const app = createApp(c, store),
  server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3000 });
process.on("SIGTERM", () => {
  app.shutdown();
  server.close(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  });
});
