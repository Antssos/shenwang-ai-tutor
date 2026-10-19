import { beforeEach, describe, expect, it } from "vitest";
import { chatReducer, createInitialChatState } from "./chatReducer";
import type { ChatMessage } from "./types";

const userMessage: ChatMessage = {
  id: "user-1",
  role: "user",
  content: "一道数学题",
  status: "complete",
};

const assistantMessage: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  content: "",
  status: "streaming",
};

describe("chatReducer", () => {
  beforeEach(() => sessionStorage.clear());

  it("追加流式文本并完成回答", () => {
    const submitted = chatReducer(createInitialChatState(), {
      type: "submit",
      userMessage,
      assistantMessage,
    });
    const streaming = chatReducer(submitted, {
      type: "delta",
      text: "先看条件。",
    });
    const completed = chatReducer(streaming, {
      type: "done",
      conversationId: "conversation-1",
      taskId: "task-1",
      messageId: "message-1",
      sources: [{ title: "数学学习资料" }],
    });

    expect(streaming.messages.at(-1)?.content).toBe("先看条件。");
    expect(completed.messages.at(-1)?.status).toBe("complete");
    expect(completed.conversationId).toBe("conversation-1");
    expect(completed.phase).toBe("idle");
    expect(completed.messages.at(-1)?.sources).toEqual([
      { title: "数学学习资料" },
    ]);
  });

  it("载入已保存的服务端会话", () => {
    const hydrated = chatReducer(createInitialChatState(), {
      type: "hydrate",
      messages: [
        userMessage,
        { ...assistantMessage, content: "历史回答", status: "complete" },
      ],
      conversationId: "saved-conversation",
    });

    expect(hydrated.messages).toHaveLength(2);
    expect(hydrated.conversationId).toBe("saved-conversation");
    expect(hydrated.phase).toBe("idle");
  });

  it("修改用户消息并删除旧的后续分支", () => {
    const initial = {
      ...createInitialChatState(),
      messages: [
        userMessage,
        { ...assistantMessage, content: "旧回答", status: "complete" as const },
        { ...userMessage, id: "later-user", content: "后续问题" },
      ],
      conversationId: "old-conversation",
    };
    const regenerated = chatReducer(initial, {
      type: "revise",
      messageId: userMessage.id,
      content: "修改后的问题",
      assistantMessage: { ...assistantMessage, id: "new-assistant" },
    });

    expect(regenerated.messages.map((message) => message.content)).toEqual([
      "修改后的问题",
      "",
    ]);
    expect(regenerated.conversationId).toBe("");
    expect(regenerated.phase).toBe("routing");
  });

  it("停止空回答时给出明确状态", () => {
    const submitted = chatReducer(createInitialChatState(), {
      type: "submit",
      userMessage,
      assistantMessage,
    });
    const stopped = chatReducer(submitted, { type: "stop" });

    expect(stopped.messages.at(-1)?.content).toBe("回答已停止。");
    expect(stopped.messages.at(-1)?.status).toBe("stopped");
    expect(stopped.statusText).toBe("已停止回答");
  });
});
