import { publicConfigSchema, teamEventSchema } from './contracts'
import type { ChatRequest, PublicConfig, TeamEvent } from './contracts'
import { parseSseStream } from './sse'
import { apiBase } from '../apiBase'

export interface StreamChatOptions {
  request: ChatRequest
  signal: AbortSignal
  onEvent: (event: TeamEvent) => void
}

async function createChatResponse(request: ChatRequest, signal: AbortSignal) {
  return fetch(`${apiBase()}/api/v1/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(request),
    signal,
  })
}

export async function loadPublicConfig(signal?: AbortSignal): Promise<PublicConfig | null> {
  const response = await fetch(`${apiBase()}/api/v1/config`, {
    credentials: 'include',
    signal,
  })
  if (!response.ok) throw new Error('服务配置暂时不可用')
  return publicConfigSchema.parse(await response.json())
}

export async function stopGeneration(taskId: string) {
  await fetch(`${apiBase()}/api/v1/chat/${encodeURIComponent(taskId)}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
}

export async function deleteConversation(conversationId: string) {
  const response = await fetch(
    `${apiBase()}/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'DELETE',
      credentials: 'include',
    },
  )
  if (!response.ok) throw new Error('云端会话没有成功清除')
}

export async function streamChat({ request, signal, onEvent }: StreamChatOptions) {
  const response = await createChatResponse(request, signal)
  if (!response.ok || !response.body) {
    let message = '服务暂时不可用，请稍后再试'
    try {
      const error = await response.json() as { message?: string }
      if (error.message) message = error.message
    } catch {
      // 非 JSON 错误响应使用通用文案。
    }
    throw new Error(message)
  }

  for await (const frame of parseSseStream(response.body, signal)) {
    let payload: unknown
    try {
      payload = JSON.parse(frame.data)
    } catch {
      continue
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue
    const result = teamEventSchema.safeParse({ type: frame.event, ...payload })
    if (result.success) onEvent(result.data)
  }
}
