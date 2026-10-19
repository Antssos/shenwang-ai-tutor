import type { SavedConversation } from "@wangxueban/contracts";
export type { SavedConversation } from "@wangxueban/contracts";
async function read(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "暂时无法读取对话。");
  return body;
}
export async function loadHistoryPage(
  cursor = "",
  signal?: AbortSignal,
): Promise<{ conversations: SavedConversation[]; nextCursor: string | null }> {
  return read(
    await fetch(
      "/api/v1/history" +
        (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      { credentials: "include", signal },
    ),
  );
}
export async function loadChatHistory(signal?: AbortSignal) {
  return (await loadHistoryPage("", signal)).conversations;
}
export async function loadConversation(
  id: string,
  signal?: AbortSignal,
): Promise<SavedConversation> {
  return read(
    await fetch("/api/v1/history/" + encodeURIComponent(id), {
      credentials: "include",
      signal,
    }),
  );
}
export async function deleteChatHistory(id: string) {
  return read(
    await fetch("/api/v1/history/" + encodeURIComponent(id), {
      method: "DELETE",
      credentials: "include",
    }),
  );
}
