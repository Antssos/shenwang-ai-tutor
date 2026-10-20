import { mkdirSync, chmodSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  createOpaqueSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./auth.js";
import type { ChatMessage, SavedConversation } from "@wangxueban/contracts";
export interface Account {
  id: string;
  username: string;
  admin: number;
}
type UserRow = Account & { password_salt: string; password_hash: string };
export class AppStore {
  readonly db: DatabaseSync;
  constructor(path: string, root = resolve(import.meta.dirname, "../../..")) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY);",
    );
    for (const name of readdirSync(resolve(root, "db/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (this.db.prepare("SELECT name FROM migrations WHERE name=?").get(name))
        continue;
      this.transaction(() => {
        this.db.exec(
          readFileSync(resolve(root, "db/migrations", name), "utf8"),
        );
        this.db.prepare("INSERT INTO migrations VALUES(?)").run(name);
      });
    }
    if (path !== ":memory:") chmodSync(path, 0o600);
  }
  private transactionDepth = 0;
  transaction<T>(fn: () => T): T {
    const nested = this.transactionDepth > 0,
      name = `tx_${this.transactionDepth}`;
    this.db.exec(nested ? `SAVEPOINT ${name}` : "BEGIN IMMEDIATE");
    this.transactionDepth++;
    try {
      const result = fn();
      this.db.exec(nested ? `RELEASE ${name}` : "COMMIT");
      return result;
    } catch (error) {
      this.db.exec(nested ? `ROLLBACK TO ${name}` : "ROLLBACK");
      if (nested) this.db.exec(`RELEASE ${name}`);
      throw error;
    } finally {
      this.transactionDepth--;
    }
  }
  async createUser(
    username: string,
    password: string,
  ): Promise<Account | null> {
    const { salt, hash } = await hashPassword(password),
      id = randomUUID();
    try {
      this.db
        .prepare(
          "INSERT INTO users(id,username,username_key,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          id,
          username,
          username.normalize("NFKC").toLowerCase(),
          salt,
          hash,
          new Date().toISOString(),
        );
      return { id, username, admin: 0 };
    } catch (e) {
      if (String(e).includes("UNIQUE")) return null;
      throw e;
    }
  }
  async authenticate(
    username: string,
    password: string,
  ): Promise<Account | null> {
    const row = this.db
      .prepare("SELECT * FROM users WHERE username_key=? AND disabled=0")
      .get(username.normalize("NFKC").toLowerCase()) as UserRow | undefined;
    // Equal-cost rejection prevents username existence from being exposed by hashing time.
    const valid = await verifyPassword(
      password,
      row?.password_salt ?? "invalid-user-salt",
      row?.password_hash ?? Buffer.alloc(64).toString("base64url"),
    );
    return row && valid
      ? { id: row.id, username: row.username, admin: row.admin }
      : null;
  }
  createSession(userId: string, hours = 168, now = Date.now()) {
    const token = createOpaqueSessionToken();
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(hashSessionToken(token), userId, now + hours * 3600000);
    return { token };
  }
  findSession(token: string | undefined, now = Date.now()): Account | null {
    if (!token) return null;
    return (
      (this.db
        .prepare(
          "SELECT u.id,u.username,u.admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>? AND u.disabled=0",
        )
        .get(hashSessionToken(token), now) as Account | undefined) ?? null
    );
  }
  deleteSession(token: string | undefined) {
    if (token)
      this.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(hashSessionToken(token));
  }
  owned(userId: string, id: string) {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM conversations WHERE id=? AND user_id=?")
        .get(id, userId),
    );
  }
  messages(id: string): ChatMessage[] {
    return (
      this.db
        .prepare(
          "SELECT id,role,content,status,sources FROM messages WHERE conversation_id=? ORDER BY position",
        )
        .all(id) as unknown as (ChatMessage & { sources: string })[]
    ).map((m) => ({ ...m, sources: JSON.parse(m.sources) }));
  }
  conversation(userId: string, id: string): SavedConversation | null {
    const row = this.db
      .prepare(
        "SELECT id,title,updated_at updatedAt FROM conversations WHERE id=? AND user_id=?",
      )
      .get(id, userId) as
      { id: string; title: string; updatedAt: string } | undefined;
    return row
      ? { ...row, conversationId: id, messages: this.messages(id) }
      : null;
  }
  listConversations(userId: string, cursor = "", limit = 20) {
    const rows = this.db
      .prepare(
        "SELECT id,title,updated_at updatedAt FROM conversations WHERE user_id=? AND (?='' OR updated_at||id<?) ORDER BY updated_at DESC,id DESC LIMIT ?",
      )
      .all(userId, cursor, cursor, limit + 1) as unknown as {
      id: string;
      title: string;
      updatedAt: string;
    }[];
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      conversations: page.map((r) => ({
        ...r,
        conversationId: r.id,
        messages: [],
      })),
      nextCursor: more ? page.at(-1)!.updatedAt + page.at(-1)!.id : null,
    };
  }
  deleteConversation(userId: string, id: string) {
    this.db
      .prepare("DELETE FROM conversations WHERE id=? AND user_id=?")
      .run(id, userId);
  }
  priorRun(userId: string, key: string) {
    return this.db
      .prepare(
        "SELECT id,conversation_id conversationId,status FROM runs WHERE user_id=? AND request_key=?",
      )
      .get(userId, key);
  }
  beginRun(
    userId: string,
    input: {
      message: string;
      conversationId: string;
      requestId: string;
      editMessageId?: string;
    },
  ) {
    return this.transaction(() => {
      let id = input.conversationId;
      if (id && !this.owned(userId, id))
        throw new Error("CONVERSATION_NOT_FOUND");
      let previous: ChatMessage[] = [];
      if (input.editMessageId) {
        const old = this.messages(id),
          index = old.findIndex(
            (m) => m.id === input.editMessageId && m.role === "user",
          );
        if (index < 0) throw new Error("MESSAGE_NOT_FOUND");
        previous = old.slice(0, index);
        id = "";
      }
      const now = new Date().toISOString();
      if (!id) {
        id = randomUUID();
        this.db
          .prepare("INSERT INTO conversations VALUES(?,?,?,?,?,?)")
          .run(
            id,
            userId,
            Array.from(input.message).slice(0, 18).join(""),
            now,
            now,
            input.conversationId || null,
          );
        previous.forEach((m, i) =>
          this.db
            .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?)")
            .run(
              randomUUID(),
              id,
              i,
              m.role,
              m.content,
              m.status,
              JSON.stringify(m.sources ?? []),
            ),
        );
      }
      const pos = Number(
        (
          this.db
            .prepare("SELECT count(*) n FROM messages WHERE conversation_id=?")
            .get(id) as { n: number }
        ).n,
      );
      if (pos >= 200) throw new Error("CONVERSATION_FULL");
      const userMessageId = randomUUID(),
        messageId = randomUUID(),
        runId = randomUUID();
      this.db
        .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?)")
        .run(userMessageId, id, pos, "user", input.message, "complete", "[]");
      this.db
        .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?)")
        .run(messageId, id, pos + 1, "assistant", "", "streaming", "[]");
      this.db
        .prepare("UPDATE conversations SET updated_at=? WHERE id=?")
        .run(now, id);
      this.db
        .prepare(
          "INSERT INTO runs(id,user_id,conversation_id,request_key,message_id,status,route,created_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          runId,
          userId,
          id,
          input.requestId,
          messageId,
          "running",
          null,
          now,
        );
      return { id: runId, conversationId: id, messageId, userMessageId };
    });
  }
  admit(
    userId: string,
    input: Parameters<AppStore["beginRun"]>[1],
    quota?: {
      tokens: number;
      requests: number;
      userBudget: number;
      globalBudget: number;
    },
  ) {
    return this.transaction(() => {
      if (this.priorRun(userId, input.requestId))
        throw new Error("DUPLICATE_REQUEST");
      const run = this.beginRun(userId, input);
      if (
        quota &&
        !this.reserve(
          userId,
          quota.tokens,
          quota.requests,
          quota.userBudget,
          quota.globalBudget,
        )
      )
        throw new Error("QUOTA_EXCEEDED");
      return run;
    });
  }
  finish(
    run: { id: string; messageId: string; conversationId: string },
    content: string,
    status: string,
    sources: unknown[],
    route: string,
  ) {
    this.transaction(() => {
      this.db
        .prepare("UPDATE messages SET content=?,status=?,sources=? WHERE id=?")
        .run(content, status, JSON.stringify(sources), run.messageId);
      this.db
        .prepare("UPDATE runs SET status=?,route=? WHERE id=?")
        .run(status, route, run.id);
      this.db
        .prepare("UPDATE conversations SET updated_at=? WHERE id=?")
        .run(new Date().toISOString(), run.conversationId);
    });
  }
  recordVersions(
    id: string,
    corpus: string,
    policy: string,
    retrieval: unknown[] = [],
  ) {
    this.db
      .prepare(
        "UPDATE runs SET corpus_version=?,policy_version=?,retrieval_json=? WHERE id=?",
      )
      .run(corpus, policy, JSON.stringify(retrieval), id);
  }
  checkpoint(messageId: string, content: string) {
    this.db
      .prepare("UPDATE messages SET content=? WHERE id=?")
      .run(content, messageId);
  }
  reserve(
    userId: string,
    tokens: number,
    requests: number,
    userBudget: number,
    globalBudget: number,
    day = new Date().toISOString().slice(0, 10),
  ) {
    return this.transaction(() => {
      for (const key of [userId, "global"]) {
        const row = this.db
          .prepare(
            "SELECT requests,tokens FROM quotas WHERE subject=? AND day=?",
          )
          .get(key, day) as { requests: number; tokens: number } | undefined;
        if (
          (key === userId && (row?.requests ?? 0) >= requests) ||
          (row?.tokens ?? 0) + tokens >
            (key === userId ? userBudget : globalBudget)
        )
          return false;
      }
      for (const key of [userId, "global"])
        this.db
          .prepare(
            "INSERT INTO quotas VALUES(?,?,1,?) ON CONFLICT(subject,day) DO UPDATE SET requests=requests+1,tokens=tokens+excluded.tokens",
          )
          .run(key, day, tokens);
      return true;
    });
  }
  cleanup(days: number) {
    const before = new Date(Date.now() - days * 86400000).toISOString();
    this.db
      .prepare(
        "DELETE FROM conversations WHERE updated_at<? AND id NOT IN (SELECT conversation_id FROM runs WHERE status='running')",
      )
      .run(before);
    this.db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
    this.db.prepare("DELETE FROM quotas WHERE day<?").run(before.slice(0, 10));
  }
  recover() {
    this.db.exec(
      "UPDATE messages SET status='error' WHERE status='streaming'; UPDATE runs SET status='error' WHERE status='running';",
    );
  }
  close() {
    this.db.close();
  }
}
