import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  message: ChatMessage;
  editable?: boolean;
  onEdit?: (messageId: string, content: string) => void;
}

export function MessageBubble({
  message,
  editable = false,
  onEdit,
}: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  function saveEdit() {
    const content = draft.trim();
    if (!content || content === message.content) {
      setEditing(false);
      setDraft(message.content);
      return;
    }
    setEditing(false);
    onEdit?.(message.id, content);
  }

  return (
    <article className={`message-row ${isAssistant ? "assistant" : "user"}`}>
      {isAssistant && (
        <span className="assistant-avatar" aria-hidden="true">
          望
        </span>
      )}
      <div className="message-content">
        <span className="message-author">{isAssistant ? "望学伴" : "你"}</span>
        {editing ? (
          <div className="message-editor">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
              rows={4}
            />
            <div>
              <button
                type="button"
                className="message-action"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.content);
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="message-action primary"
                onClick={saveEdit}
                disabled={!draft.trim()}
              >
                保存并重新生成
              </button>
            </div>
          </div>
        ) : (
          <div className={`message-bubble ${message.status}`}>
            {message.content ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeSanitize, rehypeKatex]}
                components={{
                  img: () => null,
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : (
              <span className="typing-dots" aria-label="正在准备回答">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
        )}
        {!isAssistant && editable && !editing && (
          <button
            type="button"
            className="message-edit-button"
            onClick={() => setEditing(true)}
            aria-label="编辑"
            title="编辑这条消息"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Zm2-3.4 8.8-8.8 1.4 1.4L7.4 18H6v-1.4ZM17.6 2.2a2 2 0 0 1 2.8 0l1.4 1.4a2 2 0 0 1 0 2.8l-1.4 1.4-4.2-4.2 1.4-1.4Z" />
            </svg>
            <span>编辑</span>
          </button>
        )}
        {isAssistant && message.sources && message.sources.length > 0 && (
          <div className="message-sources" aria-label="参考资料">
            <small>参考资料</small>
            <ul>
              {message.sources.map((source) => (
                <li key={source.chunkId ?? source.title}>
                  {source.title}
                  {source.section ? ` · ${source.section}` : ""}
                  {source.version ? `（${source.version}）` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {message.status === "stopped" && (
          <small className="message-note">回答已由你停止</small>
        )}
      </div>
    </article>
  );
}
