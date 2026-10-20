import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
const apps: ReturnType<typeof createApp>[] = [];
afterEach(() => {
  for (const a of apps) {
    a.shutdown();
    a.store.close();
  }
  apps.length = 0;
});
function fixture() {
  const a = createApp(
    loadConfig({
      INVITE_CODE: "test-only-invitation",
      DATABASE_PATH: ":memory:",
      AI_PROVIDER: "test",
      ALLOW_TEST_PROVIDER: "true",
      DAILY_TOKEN_BUDGET: "1000000",
      GLOBAL_DAILY_TOKEN_BUDGET: "2000000",
    }),
  );
  apps.push(a);
  return a;
}
async function register(app: ReturnType<typeof fixture>, username: string) {
  const r = await app.request("/api/v1/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3000",
    },
    body: JSON.stringify({
      username,
      password: "password-123",
      inviteCode: "test-only-invitation",
    }),
  });
  expect(r.status).toBe(201);
  return r.headers.get("set-cookie")!.split(";")[0];
}
function post(
  app: ReturnType<typeof fixture>,
  path: string,
  cookie: string,
  body: unknown,
) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}
function events(text: string) {
  return text.split("\n\n").flatMap((frame) => {
    const line = frame.split("\n").find((l) => l.startsWith("data:"));
    return line ? [JSON.parse(line.slice(5))] : [];
  });
}
describe("same-origin API", () => {
  it("streams, saves on server, branches edited history and isolates accounts", async () => {
    const app = fixture(),
      cookie = await register(app, "first"),
      other = await register(app, "second");
    const r = await post(app, "/api/v1/chat/stream", cookie, {
      message: "你好，我喜欢苹果",
      requestId: "one",
    });
    expect(r.status).toBe(200);
    const data = events(await r.text()),
      done = data.at(-1);
    expect(done.status).toBe("complete");
    const id = done.conversationId;
    expect(
      (
        await app.request("/api/v1/history/" + id, {
          headers: { Cookie: other },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await post(app, "/api/v1/chat/stream", other, {
          message: "你好",
          conversationId: id,
          requestId: "attack",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await post(app, "/api/v1/chat/stream", cookie, {
          message: "你好",
          requestId: "one",
        })
      ).status,
    ).toBe(409);
    const next = events(
      await (
        await post(app, "/api/v1/chat/stream", cookie, {
          message: "你还记得吗",
          conversationId: id,
          requestId: "two",
        })
      ).text(),
    ).at(-1);
    const history = app.store.conversation(
      app.store.findSession(cookie.split("=")[1])!.id,
      id,
    )!;
    const edited = events(
      await (
        await post(app, "/api/v1/chat/stream", cookie, {
          message: "请记得苹果",
          conversationId: id,
          editMessageId: history.messages[2].id,
          requestId: "three",
        })
      ).text(),
    ).at(-1);
    expect(edited.conversationId).not.toBe(id);
    const detail = await (
      await app.request("/api/v1/history/" + edited.conversationId, {
        headers: { Cookie: cookie },
      })
    ).json();
    expect(detail.messages.at(-1).content).toContain("你好，我喜欢苹果");
    expect(detail.messages.at(-1).content).not.toContain("你还记得吗");
    expect(next.status).toBe("complete");
    expect(
      (
        await app.request("/api/v1/history/" + id, {
          method: "PUT",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(404);
  }, 15000);
  it("enforces origin, streaming request size, role, safe cookies and public config independence", async () => {
    const app = fixture(),
      cookie = await register(app, "first");
    const session = await app.request("/api/v1/session", {
      headers: { Cookie: cookie },
    });
    expect((await session.json()).authenticated).toBe(true);
    expect((await app.request("/api/v1/history")).status).toBe(401);
    expect(
      (
        await app.request("/api/v1/admin/status", {
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(403);
    const cross = await app.request("/api/v1/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.test",
      },
      body: "{}",
    });
    expect(cross.status).toBe(403);
    expect(
      (
        await post(app, "/api/v1/chat/stream", cookie, {
          message: "x".repeat(20000),
          requestId: "big",
        })
      ).status,
    ).toBe(413);
    expect((await app.request("/api/v1/config")).status).toBe(200);
  });
  it("uses fixed safety response even with disabled provider", async () => {
    const app = createApp(
      loadConfig({
        INVITE_CODE: "test-only-invitation",
        DATABASE_PATH: ":memory:",
      }),
    );
    apps.push(app);
    const cookie = await register(app, "first"),
      r = await post(app, "/api/v1/chat/stream", cookie, {
        message: "我不想活了",
        requestId: "safety",
      });
    const frames = events(await r.text());
    expect(frames.at(-1).route).toBe("safety_risk");
    expect(frames.at(-1).status).toBe("complete");
  });
  it("restricts cancellation to the owner and persists stopped output", async () => {
    const app = fixture(),
      cookie = await register(app, "first"),
      other = await register(app, "second");
    const response = await post(app, "/api/v1/chat/stream", cookie, {
      message: "你好" + "苹果".repeat(80),
      requestId: "cancel",
    });
    const reader = response.body!.getReader(),
      first = new TextDecoder().decode((await reader.read()).value),
      run = events(first)[0];
    expect(
      (await post(app, "/api/v1/chat/" + run.taskId + "/stop", other, {}))
        .status,
    ).toBe(404);
    expect(
      (await post(app, "/api/v1/chat/" + run.taskId + "/stop", cookie, {}))
        .status,
    ).toBe(200);
    let text = first;
    while (true) {
      const x = await reader.read();
      if (x.done) break;
      text += new TextDecoder().decode(x.value);
    }
    expect(events(text).at(-1).status).toBe("stopped");
  });
});

it.each(["user", "global"] as const)(
  "keeps crisis help reachable after %s paid budget is exhausted",
  async (limit) => {
    const config = loadConfig({
        INVITE_CODE: "test-only-invitation",
        DATABASE_PATH: ":memory:",
        ...(limit === "user"
          ? { DAILY_TOKEN_BUDGET: "1" }
          : { GLOBAL_DAILY_TOKEN_BUDGET: "1" }),
      }),
      app = createApp(config);
    apps.push(app);
    const cookie = await register(app, "safetyuser");
    expect(
      (
        await post(app, "/api/v1/chat/stream", cookie, {
          message: "普通问题",
          requestId: "ordinary",
        })
      ).status,
    ).toBe(429);
    const r = await post(app, "/api/v1/chat/stream", cookie, {
      message: "我不想活了",
      requestId: "crisis",
    });
    expect(r.status).toBe(200);
    expect(events(await r.text()).at(-1).route).toBe("safety_risk");
    expect(app.store.db.prepare("SELECT count(*) n FROM quotas").get()!.n).toBe(
      0,
    );
  },
);
it("keeps fixed help outside generation capacity and independently bounds its writes", async () => {
  const app = fixture(),
    cookie = await register(app, "safetyuser");
  const normal = await post(app, "/api/v1/chat/stream", cookie, {
      message: "你好" + "苹果".repeat(50),
      requestId: "busy",
    }),
    reader = normal.body!.getReader();
  await reader.read();
  const crisis = await post(app, "/api/v1/chat/stream", cookie, {
    message: "我不想活了",
    requestId: "while-busy",
  });
  expect(crisis.status).toBe(200);
  expect(events(await crisis.text()).at(-1).route).toBe("safety_risk");
  app.shutdown();
  while (!(await reader.read()).done) {
    /* finish cancellation before closing DB */
  }
  for (let i = 0; i < 9; i++)
    await (
      await post(app, "/api/v1/chat/stream", cookie, {
        message: "我不想活了",
        requestId: "crisis-" + i,
      })
    ).text();
  const limited = await post(app, "/api/v1/chat/stream", cookie, {
    message: "我不想活了",
    requestId: "bounded",
  });
  expect(limited.status).toBe(429);
  expect((await limited.json()).message).toContain("可信任");
});
it("allows successful users behind a shared socket while bounding failed account attempts", async () => {
  const app = fixture();
  for (let i = 0; i < 6; i++) await register(app, "shared-" + i);
  for (let i = 0; i < 5; i++)
    expect(
      (
        await post(app, "/api/v1/login", "", {
          username: "shared-0",
          password: "incorrect-password",
        })
      ).status,
    ).toBe(401);
  expect(
    (
      await post(app, "/api/v1/login", "", {
        username: "shared-0",
        password: "password-123",
      })
    ).status,
  ).toBe(429);
  expect(
    (
      await post(app, "/api/v1/login", "", {
        username: "shared-1",
        password: "password-123",
      })
    ).status,
  ).toBe(200);
});
it("does not invoke an unavailable supplier for an explicitly recognized crisis", async () => {
  const app = createApp(
    loadConfig({
      INVITE_CODE: "test-only-invitation",
      DATABASE_PATH: ":memory:",
      AI_PROVIDER: "openai",
      MODEL_API_KEY: "synthetic-not-a-real-key",
      MODEL_NAME: "fixture",
    }),
  );
  apps.push(app);
  const { vi } = await import("vitest");
  const classify = vi
      .spyOn(app.engine.provider, "classify")
      .mockRejectedValue(new Error("unavailable")),
    generate = vi.spyOn(app.engine.provider, "generate");
  const cookie = await register(app, "supplier-user"),
    r = await post(app, "/api/v1/chat/stream", cookie, {
      message: "我不想活了",
      requestId: "crisis-no-supplier",
    });
  expect(events(await r.text()).at(-1).route).toBe("safety_risk");
  expect(classify).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});
