import { createServer } from "node:http";
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
