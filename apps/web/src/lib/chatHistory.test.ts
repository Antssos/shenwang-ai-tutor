import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadHistoryPage,
  loadConversation,
  deleteChatHistory,
} from "./chatHistory";
beforeEach(() => vi.restoreAllMocks());
describe("server-owned history client", () => {
  it("loads summaries and fetches selected detail separately", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            conversations: [{ id: "one", messages: [] }],
            nextCursor: "cursor",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "one", messages: [{ content: "hello" }] }),
        ),
      );
    expect((await loadHistoryPage()).nextCursor).toBe("cursor");
    expect((await loadConversation("one")).messages).toHaveLength(1);
    expect(fetch.mock.calls[1][0]).toBe("/api/v1/history/one");
  });
  it("deletes through the same-origin authenticated API", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"deleted":true}'));
    await deleteChatHistory("one");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/history/one",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });
});
