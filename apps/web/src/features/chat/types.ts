export type MessageRole = "user" | "assistant";
export type MessageStatus = "streaming" | "complete" | "stopped" | "error";
export type ChatPhase = "idle" | "routing" | "streaming" | "error";

export type { ChatMessage } from "@wangxueban/contracts";
import type { ChatMessage } from "@wangxueban/contracts";

export interface ChatState {
  messages: ChatMessage[];
  draft: string;
  phase: ChatPhase;
  statusText: string;
  activeMessageId: string | null;
  conversationId: string;
  taskId: string;
  messageId: string;
  safetyActive: boolean;
  error: string | null;
}

export type ChatAction =
  | {
      type: "bind";
      conversationId: string;
      userMessageId: string;
      messageId: string;
    }
  | { type: "configure"; openingStatement: string }
  | { type: "hydrate"; messages: ChatMessage[]; conversationId: string }
  | { type: "set-draft"; value: string }
  | { type: "submit"; userMessage: ChatMessage; assistantMessage: ChatMessage }
  | {
      type: "revise";
      messageId: string;
      content: string;
      assistantMessage: ChatMessage;
    }
  | { type: "status"; text: string; taskId?: string }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "safety"; active: boolean }
  | {
      type: "done";
      conversationId: string;
      taskId: string;
      messageId: string;
      status?: MessageStatus;
      sources: ChatMessage["sources"];
    }
  | { type: "stop" }
  | { type: "fail"; message: string }
  | { type: "reset"; openingStatement?: string };
