import { useEffect, useReducer, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import promptCenter from '../../assets/prompt-center.png'
import promptOrganize from '../../assets/prompt-organize.png'
import promptStudy from '../../assets/prompt-study.png'
import { loadPublicConfig, stopGeneration, streamChat } from '../../lib/api/chatApi'
import type { PublicConfig, TeamEvent } from '../../lib/api/contracts'
import { loadChatHistory, saveChatHistory } from '../../lib/chatHistory'
import type { SavedConversation } from '../../lib/chatHistory'
import { chatReducer, createInitialChatState } from './chatReducer'
import { MessageBubble } from './MessageBubble'
import type { ChatMessage } from './types'

const fallbackQuickPrompts = [
  '这道学习题我应该从哪里开始想？',
  '请介绍一下申望儿童关爱服务中心。',
  '帮我把一个复杂的问题拆成简单步骤。',
]

const quickStartCards = [
  { label: '问学习', hint: '一起找到下一小步', image: promptStudy },
  { label: '了解中心', hint: '认识申望儿童关爱服务中心', image: promptCenter },
  { label: '梳理问题', hint: '把复杂想法整理清楚', image: promptOrganize },
]

function randomId(prefix: string) {
  const value = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `${prefix}-${value}`
}

function titleFromMessages(messages: ChatMessage[]) {
  const text = messages.find((message) => message.role === 'user')?.content.trim() ?? '新对话'
  return Array.from(text).slice(0, 18).join('') || '新对话'
}

interface ChatPageProps {
  username: string
  onLogout: () => void | Promise<void>
}

export function ChatPage({ username, onLogout }: ChatPageProps) {
  const [state, dispatch] = useReducer(chatReducer, undefined, createInitialChatState)
  const [activeLocalId, setActiveLocalId] = useState(() => randomId('chat'))
  const [histories, setHistories] = useState<SavedConversation[]>([])
  const [historyReady, setHistoryReady] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const isBusy = state.phase === 'routing' || state.phase === 'streaming'
  const maxInputLength = publicConfig?.maxInputLength ?? 1000
  const characterCount = Array.from(state.draft).length
  const quickPrompts = publicConfig?.suggestedQuestions.length
    ? publicConfig.suggestedQuestions.slice(0, 3)
    : fallbackQuickPrompts
  const hasMessages = state.messages.some((message) => message.role === 'user')

  useEffect(() => {
    const controller = new AbortController()
    void loadChatHistory(controller.signal)
      .then(setHistories)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setHistoryError(error instanceof Error ? error.message : '暂时无法读取对话记录。')
      })
      .finally(() => setHistoryReady(true))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadPublicConfig(controller.signal)
      .then(setPublicConfig)
      .catch(() => setPublicConfig(null))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!historyReady || !hasMessages) return
    const conversation: SavedConversation = {
      id: activeLocalId,
      title: titleFromMessages(state.messages),
      updatedAt: new Date().toISOString(),
      conversationId: state.conversationId,
      messages: state.messages,
    }
    setHistories((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)].slice(0, 50))
    const timer = window.setTimeout(() => {
      void saveChatHistory(conversation)
        .then(() => setHistoryError(''))
        .catch((error) => setHistoryError(error instanceof Error ? error.message : '暂时无法保存对话记录。'))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [activeLocalId, hasMessages, historyReady, state.conversationId, state.messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [state.messages, state.phase])

  function handleTeamEvent(event: TeamEvent) {
    switch (event.type) {
      case 'status':
        dispatch({ type: 'status', text: event.taskId ? '正在回答…' : '正在思考…', taskId: event.taskId })
        break
      case 'delta':
        dispatch({ type: 'delta', text: event.text })
        break
      case 'replace':
        dispatch({ type: 'replace', text: event.text })
        break
      case 'safety':
        dispatch({ type: 'safety', active: event.active })
        break
      case 'done':
        dispatch({
          type: 'done',
          conversationId: event.conversationId,
          taskId: event.taskId,
          messageId: event.messageId,
          sources: event.sources,
        })
        break
      case 'error':
        dispatch({ type: 'fail', message: event.message })
        break
    }
  }

  async function requestAnswer(message: string, conversationId: string) {
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      await streamChat({
        request: { message, conversationId },
        signal: controller.signal,
        onEvent: handleTeamEvent,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      dispatch({ type: 'fail', message: error instanceof Error ? error.message : '服务暂时不可用，请稍后再试。' })
    } finally {
      abortControllerRef.current = null
    }
  }

  function newAssistantMessage(): ChatMessage {
    return { id: randomId('assistant'), role: 'assistant', content: '', status: 'streaming' }
  }

  async function sendMessage() {
    const message = state.draft.trim()
    if (!message || isBusy) return
    if (Array.from(message).length > maxInputLength) {
      dispatch({ type: 'fail', message: `内容有点长，请缩短到 ${maxInputLength} 个字符以内。` })
      return
    }
    dispatch({
      type: 'submit',
      userMessage: { id: randomId('user'), role: 'user', content: message, status: 'complete' },
      assistantMessage: newAssistantMessage(),
    })
    await requestAnswer(message, state.conversationId)
  }

  function editMessage(messageId: string, content: string) {
    if (isBusy || Array.from(content).length > maxInputLength) return
    abortControllerRef.current?.abort()
    dispatch({ type: 'revise', messageId, content, assistantMessage: newAssistantMessage() })
    void requestAnswer(content, '')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void sendMessage()
    }
  }

  function startNewConversation() {
    abortControllerRef.current?.abort()
    setActiveLocalId(randomId('chat'))
    dispatch({ type: 'reset' })
    setMobileSidebarOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function openConversation(conversation: SavedConversation) {
    abortControllerRef.current?.abort()
    setActiveLocalId(conversation.id)
    dispatch({ type: 'hydrate', messages: conversation.messages, conversationId: conversation.conversationId })
    setMobileSidebarOpen(false)
  }

  function stopAnswer() {
    const taskId = state.taskId
    abortControllerRef.current?.abort()
    dispatch({ type: 'stop' })
    if (taskId) void stopGeneration(taskId).catch(() => undefined)
  }

  return (
    <main className="chat-workspace">
      <aside className={mobileSidebarOpen ? 'chat-sidebar mobile-open' : 'chat-sidebar'} id="chat-history-sidebar">
        <div className="sidebar-top">
          <Link className="brand compact" to="/" aria-label="返回望学伴首页">
            <span className="brand-mark">望</span><strong>望学伴</strong>
          </Link>
          <button className="sidebar-new-chat" type="button" onClick={startNewConversation}>
            <span>＋</span>开启新对话
          </button>
        </div>
        <section className="history-section" aria-label="聊天记录">
          <p>最近对话</p>
          <div className="history-list">
            {!historyReady && <span className="history-empty">正在读取对话记录…</span>}
            {historyReady && histories.length === 0 && <span className="history-empty">对话记录会显示在这里</span>}
            {histories.map((conversation) => (
              <button
                className={conversation.id === activeLocalId ? 'history-item active' : 'history-item'}
                type="button"
                key={conversation.id}
                onClick={() => openConversation(conversation)}
                title={conversation.title}
              >
                {conversation.title}
              </button>
            ))}
          </div>
          {historyError && <small className="history-error">{historyError}</small>}
        </section>
        <div className="sidebar-account">
          <span className="account-avatar" aria-hidden="true">{Array.from(username)[0]}</span>
          <div><strong>{username}</strong><small>账号已登录</small></div>
          <button type="button" onClick={() => void onLogout()}>退出</button>
        </div>
      </aside>

      {mobileSidebarOpen && (
        <button
          className="mobile-sidebar-backdrop"
          type="button"
          aria-label="收起历史对话"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <button
        className={mobileSidebarOpen ? 'mobile-history-toggle open' : 'mobile-history-toggle'}
        type="button"
        aria-label={mobileSidebarOpen ? '收起历史对话' : '展开历史对话'}
        aria-controls="chat-history-sidebar"
        aria-expanded={mobileSidebarOpen}
        onClick={() => setMobileSidebarOpen((open) => !open)}
      >
        <span aria-hidden="true">{mobileSidebarOpen ? '‹' : '›'}</span>
      </button>

      <section className={hasMessages ? 'chat-main has-conversation' : 'chat-main empty-chat'} aria-label="望学伴对话">
        <header className="chat-main-header"><span>望学伴</span><Link to="/about">关于与使用须知</Link></header>
        {!hasMessages ? (
          <div className="chat-empty-state">
            <h1>今天想聊点什么？</h1>
            <p>可以问学习问题，也可以了解申望儿童关爱服务中心。</p>
            <div className="quick-start-grid" aria-label="选择对话方向">
              {quickStartCards.map((card, index) => (
                <button type="button" key={card.label} onClick={() => {
                  dispatch({ type: 'set-draft', value: quickPrompts[index] ?? fallbackQuickPrompts[index] })
                  inputRef.current?.focus()
                }}>
                  <span className="quick-start-main">
                    <img src={card.image} alt="" aria-hidden="true" />
                    <strong>{card.label}</strong>
                  </span>
                  <small>{card.hint}</small>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="conversation-scroll" aria-live="polite">
            <div className="conversation-inner">
              {state.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  editable={!isBusy && message.role === 'user'}
                  onEdit={editMessage}
                />
              ))}
              {state.error && <div className="form-error chat-error" role="alert">{state.error}</div>}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        <div className="chat-input-area">
          <form className="deep-composer" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              value={state.draft}
              onChange={(event) => dispatch({ type: 'set-draft', value: event.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="给望学伴发送消息"
              maxLength={maxInputLength}
              rows={3}
              disabled={isBusy}
              aria-label="输入消息"
            />
            <div className="deep-composer-actions">
              <span className={characterCount > maxInputLength * 0.9 ? 'character-count warning' : 'character-count'}>
                {characterCount}/{maxInputLength}
              </span>
              {isBusy ? (
                <button className="round-send stop" type="button" onClick={stopAnswer} aria-label="停止回答"><span aria-hidden="true" /></button>
              ) : (
                <button className="round-send" type="submit" disabled={!state.draft.trim()} aria-label="发送消息">↑</button>
              )}
            </div>
          </form>
          <p className="composer-caption" role="status" aria-live="polite">
            {isBusy ? state.statusText : '内容由 AI 生成，请核对重要信息'}
          </p>
        </div>
      </section>
    </main>
  )
}
