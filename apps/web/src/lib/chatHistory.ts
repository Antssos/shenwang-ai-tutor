import type { ChatMessage } from '../features/chat/types'
import { apiBase } from './apiBase'

export interface SavedConversation {
  id: string
  title: string
  updatedAt: string
  conversationId: string
  messages: ChatMessage[]
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { message?: string } | null
  return new Error(payload?.message ?? fallback)
}

export async function loadChatHistory(signal?: AbortSignal): Promise<SavedConversation[]> {
  const response = await fetch(`${apiBase()}/api/v1/history`, {
    credentials: 'include',
    signal,
  })
  if (!response.ok) throw await responseError(response, '暂时无法读取对话记录。')
  const payload = await response.json() as { conversations?: SavedConversation[] }
  return Array.isArray(payload.conversations) ? payload.conversations : []
}

export async function saveChatHistory(conversation: SavedConversation) {
  const response = await fetch(`${apiBase()}/api/v1/history/${encodeURIComponent(conversation.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(conversation),
  })
  if (!response.ok) throw await responseError(response, '暂时无法保存对话记录。')
}

export async function deleteChatHistory(conversationId: string) {
  const response = await fetch(`${apiBase()}/api/v1/history/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) throw await responseError(response, '暂时无法删除对话记录。')
}
