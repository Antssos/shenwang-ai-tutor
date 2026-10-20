import type { ChatAction, ChatMessage, ChatState } from "./types";

export function createInitialChatState(_openingStatement?: string): ChatState {
  return {
    messages: [],
    draft: "",
    phase: "idle",
    statusText: "",
    activeMessageId: null,
    conversationId: "",
    taskId: "",
    messageId: "",
    safetyActive: false,
    error: null,
  };
}

function updateActiveMessage(
  messages: ChatMessage[],
  activeMessageId: string | null,
  update: (message: ChatMessage) => ChatMessage,
) {
  return messages.map((message) =>
    message.id === activeMessageId ? update(message) : message,
  );
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "bind":
      return {
        ...state,
        conversationId: action.conversationId,
        activeMessageId: action.messageId,
        messages: state.messages.map((m, i) =>
          i === state.messages.length - 2
            ? { ...m, id: action.userMessageId }
            : i === state.messages.length - 1
              ? { ...m, id: action.messageId }
              : m,
        ),
      };
    case "configure":
      return state;
    case "hydrate":
      return {
        ...createInitialChatState(),
        messages: action.messages,
        conversationId: action.conversationId,
      };
    case "set-draft":
      return { ...state, draft: action.value, error: null };
    case "submit":
      return {
        ...state,
        messages: [
          ...state.messages,
          action.userMessage,
          action.assistantMessage,
        ],
        draft: "",
        phase: "routing",
        statusText: "正在理解你的问题…",
        activeMessageId: action.assistantMessage.id,
        taskId: "",
        messageId: "",
        safetyActive: false,
        error: null,
      };
    case "revise": {
      const messageIndex = state.messages.findIndex(
        (message) => message.id === action.messageId && message.role === "user",
      );
      if (messageIndex < 0) return state;
      const revisedMessage: ChatMessage = {
        ...state.messages[messageIndex],
        content: action.content,
        status: "complete",
      };
      return {
        ...createInitialChatState(),
        messages: [
          ...state.messages.slice(0, messageIndex),
          revisedMessage,
          action.assistantMessage,
        ],
        phase: "routing",
        statusText: "正在理解你的问题…",
        activeMessageId: action.assistantMessage.id,
      };
    }
    case "status":
      return {
        ...state,
        phase: action.taskId ? "streaming" : "routing",
        statusText: action.text,
        taskId: action.taskId ?? state.taskId,
      };
    case "delta":
      return {
        ...state,
        phase: "streaming",
        statusText: "正在回答…",
        messages: updateActiveMessage(
          state.messages,
          state.activeMessageId,
          (message) => ({
            ...message,
            content: message.content + action.text,
            status: "streaming",
          }),
        ),
      };
    case "replace":
      return {
        ...state,
        phase: "streaming",
        statusText: "正在回答…",
        messages: updateActiveMessage(
          state.messages,
          state.activeMessageId,
          (message) => ({
            ...message,
            content: action.text,
            status: "streaming",
          }),
        ),
      };
    case "safety":
      return { ...state, safetyActive: action.active };
    case "done":
      return {
        ...state,
        phase: "idle",
        statusText: "回答完成",
        activeMessageId: null,
        conversationId: action.conversationId,
        taskId: action.taskId,
        messageId: action.messageId,
        messages: updateActiveMessage(
          state.messages,
          state.activeMessageId,
          (message) => ({
            ...message,
            status: action.status ?? "complete",
            sources: action.sources,
          }),
        ),
      };
    case "stop":
      return {
        ...state,
        phase: "idle",
        statusText: "已停止回答",
        activeMessageId: null,
        taskId: "",
        messages: updateActiveMessage(
          state.messages,
          state.activeMessageId,
          (message) => ({
            ...message,
            content: message.content || "回答已停止。",
            status: "stopped",
          }),
        ),
      };
    case "fail":
      return {
        ...state,
        phase: "error",
        statusText: "暂时无法回答",
        activeMessageId: null,
        taskId: "",
        error: action.message,
        messages: updateActiveMessage(
          state.messages,
          state.activeMessageId,
          (message) => ({
            ...message,
            content: message.content || action.message,
            status: "error",
          }),
        ),
      };
    case "reset":
      return createInitialChatState(action.openingStatement);
  }
}
