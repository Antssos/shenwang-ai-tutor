import { createServer, type RequestListener } from "node:http";
import { afterEach, describe, it, expect } from "vitest";
import { Provider } from "./provider.js";
import { loadConfig } from "./config.js";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  for (const s of servers) {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
  servers.length = 0;
});
async function upstream(broken = false) {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    res.setHeader(
      "Content-Type",
      input.stream ? "text/event-stream" : "application/json",
    );
    if (!input.stream) {
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '{"route":"general_chat"}' } }],
        }),
      );
      return;
    }
    res.write('data: {"choices":[{"delta":{"content":"你');
    res.write('好"}}]}\r\n\r\n');
    if (!broken) res.write("data: [DONE]\n\n");
    res.end();
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  return new Provider(
    loadConfig({
      INVITE_CODE: "test-only-invitation",
      MODEL_API_BASE: `http://127.0.0.1:${addr.port}/v1`,
      MODEL_API_KEY: "test-only-model-key",
      MODEL_NAME: "synthetic",
      AI_PROVIDER: "openai",
    }),
  );
}
describe("OpenAI-compatible protocol adapter (synthetic upstream)", () => {
  it("classifies and decodes fragmented CRLF SSE without exposing protocol events", async () => {
    const p = await upstream(),
      signal = new AbortController().signal;
    expect(await p.classify([{ role: "user", content: "你好" }], signal)).toBe(
      "general_chat",
    );
    let output = "";
    for await (const t of p.generate(
      [{ role: "user", content: "你好" }],
      signal,
    ))
      output += t;
    expect(output).toBe("你好");
  });
  it("rejects a stream that disconnects before completion", async () => {
    const p = await upstream(true);
    await expect(
      (async () => {
        for await (const _ of p.generate(
          [{ role: "user", content: "你好" }],
          new AbortController().signal,
        )) {
          /* consume */
        }
      })(),
    ).rejects.toThrow("Incomplete");
  });
});

async function customProvider(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return new Provider(
    loadConfig({
      INVITE_CODE: "test-only-invitation",
      AI_PROVIDER: "openai",
      MODEL_API_KEY: "synthetic",
      MODEL_NAME: "fixture",
      MODEL_API_BASE: `http://127.0.0.1:${port}`,
      EMBEDDING_API_BASE: `http://127.0.0.1:${port}`,
      EMBEDDING_API_KEY: "synthetic",
      EMBEDDING_MODEL: "fixture",
      REQUEST_TIMEOUT_MS: "1000",
    }),
  );
}
it("terminates on DONE without waiting for a persistent upstream connection", async () => {
  const p = await customProvider((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(
      'data: {"choices":[{"delta":{"content":"完成"}}]}\n\ndata: [DONE]\n\n',
    );
  });
  let text = "";
  for await (const part of p.generate(
    [{ role: "user", content: "你好" }],
    new AbortController().signal,
  ))
    text += part;
  expect(text).toBe("完成");
});
it.each(["length", "content_filter", "tool_calls"])(
  "does not mark %s termination as a complete answer",
  async (reason) => {
    const p = await customProvider((_req, res) =>
      res.end(
        "data: " +
          JSON.stringify({
            choices: [
              { delta: { content: "部分文本" }, finish_reason: reason },
            ],
          }) +
          "\n\ndata: [DONE]\n\n",
      ),
    );
    await expect(
      (async () => {
        for await (const _ of p.generate(
          [{ role: "user", content: "你好" }],
          new AbortController().signal,
        )) {
          /* consume */
        }
      })(),
    ).rejects.toThrow("not complete");
  },
);
it("handles a stop frame and usage trailer without waiting for EOF", async () => {
  const p = await customProvider((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(
      'data: {"choices":[{"delta":{"content":"完成"},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"total_tokens":4}}\n\n',
    );
  });
  let text = "";
  for await (const part of p.generate(
    [{ role: "user", content: "你好" }],
    new AbortController().signal,
  ))
    text += part;
  expect(text).toBe("完成");
});
it.each(
  [
    [
      { index: 0, embedding: [1, 0] },
      { index: 0, embedding: [0, 1] },
    ],
    [{ index: 0, embedding: [1, 0] }],
    [
      { index: 0, embedding: [1, 0] },
      { index: 1, embedding: [1] },
    ],
    [
      { index: 0, embedding: [1, 0] },
      { index: 2, embedding: [1, 0] },
    ],
  ].map((data) => ({ data })),
)("rejects malformed embedding correspondence %#", async ({ data }) => {
  const p = await customProvider((_req, res) =>
    res.end(JSON.stringify({ data })),
  );
  await expect(p.embed(["one", "two"])).rejects.toThrow();
});
it("bounds classification response bytes before parsing JSON", async () => {
  const p = await customProvider((_req, res) => {
    res.write(" ".repeat(17000));
    res.end("{}");
  });
  await expect(
    p.classify(
      [{ role: "user", content: "你好" }],
      new AbortController().signal,
    ),
  ).rejects.toThrow("Oversized");
});

it("accepts complete out-of-order embeddings and restores input order", async () => {
  const p = await customProvider((_req, res) =>
    res.end(
      JSON.stringify({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      }),
    ),
  );
  expect(await p.embed(["one", "two"])).toEqual([
    [1, 0],
    [0, 1],
  ]);
});
