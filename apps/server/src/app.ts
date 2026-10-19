import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { getConnInfo } from "@hono/node-server/conninfo";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  chatRequestSchema,
  credentialsSchema,
  registerSchema,
  type TeamEvent,
} from "@wangxueban/contracts";
import { constantTimeEqual } from "./auth.js";
import type { AppConfig } from "./config.js";
import { AppStore, type Account } from "./store.js";
import { Engine } from "./engine.js";
import { createRateLimiter } from "./rateLimit.js";

type Vars = { account: Account };
export function createApp(
  config: AppConfig,
  store = new AppStore(config.DATABASE_PATH, config.root),
) {
  const app = new Hono<{ Variables: Vars }>(),
    engine = new Engine(config, store);
  const active = new Map<
    string,
    { userId: string; conversationId: string; abort: AbortController }
  >();
  const loginLimit = createRateLimiter(5, 60000),
    minuteLimit = createRateLimiter(10, 60000);
  let authInFlight = 0;
  const cookie = "wangxueban_session";
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
      },
    }),
  );
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 16384,
      onError: (c) =>
        c.json(
          { code: "INPUT_TOO_LARGE", message: "内容过长，请缩短后再发送。" },
          413,
        ),
    }),
  );
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      if (
        (origin && origin !== config.APP_ORIGIN) ||
        c.req.header("sec-fetch-site") === "cross-site"
      )
        return c.json(
          { code: "ORIGIN_NOT_ALLOWED", message: "该页面不能访问此服务。" },
          403,
        );
      if (
        ["POST", "PUT", "PATCH"].includes(c.req.method) &&
        !c.req.header("content-type")?.startsWith("application/json")
      )
        return c.json({ message: "需要 JSON 请求。" }, 415);
    }
    await next();
  });
  app.onError((_, c) =>
    c.json(
      {
        code: "INTERNAL_ERROR",
        message: "服务暂时不可用。",
        requestId: randomUUID(),
      },
      500,
    ),
  );
  app.get("/health/live", (c) => c.json({ status: "ok" }));
  app.get("/health/ready", (c) => {
    store.db.prepare("SELECT 1").get();
    return c.json({
      status: "ok",
      model:
        config.AI_PROVIDER === "openai" ? "configured" : config.AI_PROVIDER,
    });
  });
  app.get("/healthz", (c) => c.json({ status: "ok" }));
  app.get("/api/v1/config", (c) =>
    c.json({
      appName: "望学伴",
      openingStatement:
        "你好，我是望学伴。可以问学习问题，也可以了解申望儿童关爱服务中心。",
      suggestedQuestions: [
        "请介绍一下中心。",
        "这道学习题应该从哪里开始想？",
        "我今天有点难过。",
      ],
      maxInputLength: config.MAX_INPUT_LENGTH,
      feedbackEnabled: false,
      sourcesEnabled: true,
      providerStatus:
        config.AI_PROVIDER === "openai" ? "ready" : config.AI_PROVIDER,
    }),
  );
  app.get("/api/v1/session", (c) => {
    const u = store.findSession(getCookie(c, cookie));
    return c.json({
      authenticated: !!u,
      username: u?.username ?? null,
      admin: !!u?.admin,
    });
  });
  for (const path of ["login", "register"] as const)
    app.post("/api/v1/" + path, async (c) => {
      // The app never trusts caller-supplied X-Forwarded-For; direct socket identity only.
      let ip = "local";
      try {
        const info = getConnInfo(c);
        ip = info.remote.address ?? ip;
      } catch {
        /* in-process tests */
      }
      if (!loginLimit(path + ":" + ip) || authInFlight >= 2)
        return c.json({ message: "尝试次数过多，请稍后再试。" }, 429);
      const parsed = (
        path === "register" ? registerSchema : credentialsSchema
      ).safeParse(await c.req.json().catch(() => null));
      if (!parsed.success)
        return c.json({ message: "请检查用户名、密码和邀请码。" }, 400);
      if (
        path === "register" &&
        !constantTimeEqual(
          "inviteCode" in parsed.data ? String(parsed.data.inviteCode) : "",
          config.INVITE_CODE,
        )
      )
        return c.json({ message: "邀请码不正确。" }, 403);
      authInFlight++;
      try {
        const u =
          path === "register"
            ? await store.createUser(parsed.data.username, parsed.data.password)
            : await store.authenticate(
                parsed.data.username,
                parsed.data.password,
              );
        if (!u)
          return c.json(
            {
              message:
                path === "register" ? "用户名已注册。" : "用户名或密码不正确。",
            },
            path === "register" ? 409 : 401,
          );
        setCookie(c, cookie, store.createSession(u.id).token, {
          httpOnly: true,
          secure: config.COOKIE_SECURE === "true",
          sameSite: "Lax",
          path: "/",
          maxAge: 604800,
        });
        return c.json(
          { authenticated: true, username: u.username },
          path === "register" ? 201 : 200,
        );
      } finally {
        authInFlight--;
      }
    });
  app.delete("/api/v1/session", (c) => {
    const u = store.findSession(getCookie(c, cookie));
    if (u)
      for (const v of active.values()) if (v.userId === u.id) v.abort.abort();
    store.deleteSession(getCookie(c, cookie));
    deleteCookie(c, cookie, { path: "/" });
    return c.json({ authenticated: false, username: null });
  });
  app.use("/api/v1/*", async (c, next) => {
    const u = store.findSession(getCookie(c, cookie));
    if (!u)
      return c.json({ code: "AUTH_REQUIRED", message: "请先登录。" }, 401);
    c.set("account", u);
    await next();
  });
  app.get("/api/v1/history", (c) =>
    c.json(
      store.listConversations(c.get("account").id, c.req.query("cursor") ?? ""),
    ),
  );
  app.get("/api/v1/history/:id", (c) => {
    const row = store.conversation(c.get("account").id, c.req.param("id"));
    return row ? c.json(row) : c.json({ message: "对话不存在。" }, 404);
  });
  app.delete("/api/v1/history/:id", (c) => {
    const user = c.get("account").id,
      id = c.req.param("id");
    if (
      [...active.values()].some(
        (r) => r.userId === user && r.conversationId === id,
      )
    )
      return c.json({ message: "请先停止生成。" }, 409);
    store.deleteConversation(user, id);
    return c.json({ deleted: true });
  });
  app.post("/api/v1/chat/:taskId/stop", (c) => {
    const run = active.get(c.req.param("taskId"));
    if (!run || run.userId !== c.get("account").id)
      return c.json({ message: "任务不存在或已结束。" }, 404);
    run.abort.abort("user-stopped");
    return c.json({ result: "success" });
  });
  app.post("/api/v1/chat/stream", async (c) => {
    const user = c.get("account"),
      parsed = chatRequestSchema.safeParse(
        await c.req.json().catch(() => null),
      );
    if (
      !parsed.success ||
      Array.from(parsed.data.message).length > config.MAX_INPUT_LENGTH
    )
      return c.json({ message: "请检查问题内容。" }, 400);
    if (store.priorRun(user.id, parsed.data.requestId))
      return c.json(
        {
          code: "DUPLICATE_REQUEST",
          message: "该问题已提交，请刷新查看历史。",
        },
        409,
      );
    if (
      [...active.values()].some((r) => r.userId === user.id) ||
      active.size >= config.MAX_CONCURRENT
    )
      return c.json({ message: "正在回答其他问题，请稍后再试。" }, 429);
    if (!minuteLimit(user.id))
      return c.json({ message: "提问太快，请稍等。" }, 429);
    if (
      parsed.data.conversationId &&
      !store.owned(user.id, parsed.data.conversationId)
    )
      return c.json({ message: "对话不存在。" }, 404);
    const history = parsed.data.conversationId
      ? store.messages(parsed.data.conversationId)
      : [];
    // Conservative reservation includes two model calls, UTF-8 bytes (upper bound for input tokens), evidence and outputs.
    const reservation =
      2 *
        (Buffer.byteLength(JSON.stringify(history.slice(-12))) +
          Buffer.byteLength(parsed.data.message) +
          16000) +
      config.MAX_OUTPUT_TOKENS +
      80;
    if (
      !store.reserve(
        user.id,
        reservation,
        config.DAILY_REQUESTS,
        config.DAILY_TOKEN_BUDGET,
        config.GLOBAL_DAILY_TOKEN_BUDGET,
      )
    )
      return c.json({ message: "今日使用额度已达上限，请明天再试。" }, 429);
    let run: ReturnType<AppStore["beginRun"]>;
    try {
      run = store.beginRun(user.id, parsed.data);
    } catch {
      return c.json({ message: "对话无法继续，请新建对话或刷新重试。" }, 400);
    }
    const abort = new AbortController(),
      timeout = setTimeout(
        () => abort.abort("timeout"),
        config.REQUEST_TIMEOUT_MS,
      );
    active.set(run.id, {
      userId: user.id,
      conversationId: run.conversationId,
      abort,
    });
    c.req.raw.signal.addEventListener(
      "abort",
      () => abort.abort("disconnected"),
      { once: true },
    );
    c.header("Cache-Control", "no-cache, no-transform");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      stream.onAbort(() => abort.abort("disconnected"));
      let content = "",
        sources: Awaited<ReturnType<Engine["prepare"]>>["sources"] = [],
        route: Awaited<ReturnType<Engine["prepare"]>>["route"] = "unsupported",
        status = "complete",
        lastSave = Date.now(),
        heartbeat: ReturnType<typeof setInterval> | undefined;
      const send = async (event: TeamEvent) => {
        const { type, ...data } = event;
        await stream.writeSSE({ event: type, data: JSON.stringify(data) });
      };
      try {
        await send({
          type: "status",
          phase: "routing",
          taskId: run.id,
          conversationId: run.conversationId,
          messageId: run.messageId,
          userMessageId: run.userMessageId,
        });
        heartbeat = setInterval(() => {
          void stream
            .write(": heartbeat\n\n")
            .catch(() => abort.abort("disconnected"));
        }, 10000);
        const plan = await engine.prepare(run.conversationId, abort.signal);
        sources = plan.sources;
        route = plan.route;
        if (route === "safety_risk")
          await send({ type: "safety", active: true });
        if (plan.fixed) {
          content = plan.fixed;
          await send({ type: "delta", text: content });
        } else
          for await (const delta of engine.provider.generate(
            plan.messages,
            abort.signal,
          )) {
            abort.signal.throwIfAborted();
            content += delta;
            await send({ type: "delta", text: delta });
            if (Date.now() - lastSave > 500) {
              store.checkpoint(run.messageId, content);
              lastSave = Date.now();
            }
          }
        abort.signal.throwIfAborted();
      } catch {
        status =
          abort.signal.aborted && abort.signal.reason !== "timeout"
            ? "stopped"
            : "error";
        if (status === "error") {
          const message = "回答暂时中断，已保存当前内容，请稍后重试。";
          if (!content) content = message;
          await send({
            type: "error",
            code: "GENERATION_FAILED",
            message,
          }).catch(() => {});
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        clearTimeout(timeout);
        try {
          store.finish(run, content, status, sources, route);
        } finally {
          active.delete(run.id);
        }
        console.info(
          JSON.stringify({
            event: "generation_finished",
            runId: run.id,
            route,
            status,
          }),
        );
        await send({
          type: "done",
          taskId: run.id,
          messageId: run.messageId,
          conversationId: run.conversationId,
          sources,
          status: status as "complete" | "stopped" | "error",
          route,
        }).catch(() => {});
      }
    });
  });
  app.use("/api/v1/admin/*", async (c, next) => {
    if (!c.get("account").admin)
      return c.json({ message: "需要管理员权限。" }, 403);
    await next();
  });
  app.get("/api/v1/admin/status", (c) =>
    c.json({
      provider: config.AI_PROVIDER,
      model: config.MODEL_NAME || null,
      activeRuns: active.size,
      promptVersion: engine.version,
      documents: engine.knowledge.documents(),
      quotas: store.db
        .prepare(
          "SELECT day,requests,tokens FROM quotas WHERE subject='global' ORDER BY day DESC LIMIT 7",
        )
        .all(),
      corpus:
        store.db
          .prepare("SELECT value FROM settings WHERE key='corpus_version'")
          .get() ?? null,
    }),
  );
  app.post("/api/v1/admin/documents/:id/status", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (typeof body?.active !== "boolean")
      return c.json({ message: "状态格式错误。" }, 400);
    const n = engine.knowledge.publish(c.req.param("id"), body.active);
    return n
      ? c.json({ updated: true })
      : c.json({ message: "资料不存在。" }, 404);
  });
  app.all("/api/*", (c) => c.json({ message: "接口不存在。" }, 404));
  const web = resolve(config.root, "apps/web/dist");
  if (existsSync(web)) {
    app.use("*", serveStatic({ root: web }));
    app.get("*", serveStatic({ root: web, path: "index.html" }));
  }
  return Object.assign(app, {
    store,
    engine,
    shutdown: () => {
      for (const r of active.values()) r.abort.abort("shutdown");
    },
  });
}
