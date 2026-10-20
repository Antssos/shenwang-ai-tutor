import { backup } from "node:sqlite";
import { loadConfig } from "./config.js";
import { AppStore } from "./store.js";
import { Knowledge } from "./knowledge.js";
import { Provider } from "./provider.js";
process.umask(0o077);
const config = loadConfig(),
  store = new AppStore(config.DATABASE_PATH, config.root),
  [command, ...args] = process.argv.slice(2);
try {
  switch (command) {
    case "doctor":
      console.log(
        JSON.stringify({
          sqlite: store.db.prepare("PRAGMA integrity_check").get(),
          provider: config.AI_PROVIDER,
          chatConfigured: !!config.MODEL_API_KEY && !!config.MODEL_NAME,
          embeddingConfigured:
            !!config.EMBEDDING_API_KEY && !!config.EMBEDDING_MODEL,
          documents: new Knowledge(store).documents().length,
        }),
      );
      break;
    case "import": {
      if (args.length !== 2)
        throw new Error("Usage: import KNOWLEDGE_ROOT MANIFEST_CSV");
      const p = new Provider(config);
      console.log(
        JSON.stringify(
          await new Knowledge(store).import(
            args[0],
            args[1],
            config.EMBEDDING_API_KEY ? (text) => p.embed(text) : undefined,
            config.EMBEDDING_MODEL,
            config.EMBEDDING_API_BASE,
          ),
        ),
      );
      break;
    }
    case "admin": {
      if (args.length !== 1) throw new Error("Usage: admin USERNAME");
      const result = store.db
        .prepare("UPDATE users SET admin=1 WHERE username_key=?")
        .run(args[0].normalize("NFKC").toLowerCase());
      if (!result.changes) throw new Error("Account not found");
      console.log("Admin role assigned");
      break;
    }
    case "disable": {
      if (args.length !== 1) throw new Error("Usage: disable USERNAME");
      store.transaction(() => {
        const row = store.db
          .prepare("SELECT id FROM users WHERE username_key=?")
          .get(args[0].normalize("NFKC").toLowerCase()) as
          { id: string } | undefined;
        if (!row) throw new Error("Account not found");
        store.db.prepare("UPDATE users SET disabled=1 WHERE id=?").run(row.id);
        store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
      });
      console.log("Account disabled and sessions revoked");
      break;
    }
    case "backup":
      if (args.length !== 1) throw new Error("Usage: backup TARGET");
      await backup(store.db, args[0]);
      console.log("Backup complete");
      break;
    case "cleanup":
      store.cleanup(config.RETENTION_DAYS);
      console.log("Retention cleanup complete");
      break;
    default:
      throw new Error(
        "Commands: doctor, import, admin, disable, backup, cleanup",
      );
  }
} catch (error) {
  // CSV parser errors may embed complete private records: never print their payloads.
  console.error(
    JSON.stringify({
      code: "COMMAND_FAILED",
      category: error instanceof Error ? error.name : "UnknownError",
      message:
        "Verify command arguments, input format, permissions and provider configuration.",
    }),
  );
  process.exitCode = 1;
} finally {
  store.close();
}
