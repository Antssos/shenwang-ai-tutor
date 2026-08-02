import { createHash } from 'node:crypto'
import type { AppConfig } from '../config.js'
import type { TeamEvent } from '../contracts.js'

interface DifyEvent {
  event?: string
  task_id?: string
  message_id?: string
  conversation_id?: string
  answer?: string
  data?: {
    title?: string
    status?: string
  }
  metadata?: {
    retriever_resources?: unknown[]
  }
  code?: string
  message?: string
}

export class DifyUpstreamError extends Error {
  constructor(
    public readonly code: 'UPSTREAM_ERROR' | 'UPSTREAM_TIMEOUT' | 'SERVICE_UNAVAILABLE',
    public readonly safeMessage: string,
    public readonly httpStatus: 502 | 503 | 504,
    message: string,
  ) {
    super(message)
    this.name = 'DifyUpstreamError'
  }
}

function encodeSse(event: TeamEvent) {
  const { type, ...data } = event
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

function readFrames(buffer: string) {
  const frames = buffer.split(/\r?\n\r?\n/)
  return { complete: frames.slice(0, -1), remaining: frames.at(-1) ?? '' }
}

function parseDifyFrame(frame: string): DifyEvent | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data) as DifyEvent
  } catch {
    return null
  }
}

function safeSources(resources: unknown[] | undefined) {
  if (!resources) return []
  return resources.flatMap((resource) => {
    if (!resource || typeof resource !== 'object') return []
    const item = resource as Record<string, unknown>
    const title = [item.document_name, item.title]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    return title ? [{ title: title.trim().slice(0, 120) }] : []
  })
}

export function anonymousUser(clientId: string, secret: string) {
  return `web-${createHash('sha256').update(`${secret}:${clientId}`).digest('hex').slice(0, 24)}`
}

export class DifyService {
  constructor(private readonly config: AppConfig) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.config.DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    }
  }

  async publicConfig(signal?: AbortSignal) {
    const response = await fetch(`${this.config.DIFY_API_BASE}/parameters`, {
      headers: this.headers(),
      signal,
    })
    if (!response.ok) throw new Error(`Dify parameters failed with ${response.status}`)
    const data = await response.json() as Record<string, unknown>
    const suggestions = Array.isArray(data.suggested_questions)
      ? data.suggested_questions.filter((item): item is string => typeof item === 'string').slice(0, 3)
      : []
    return {
      appName: '望学伴',
      openingStatement:
        typeof data.opening_statement === 'string' && data.opening_statement.trim()
          ? data.opening_statement
          : '你好，我是望学伴。你可以问学习问题，也可以了解申望儿童关爱服务中心。',
      suggestedQuestions: suggestions,
      maxInputLength: this.config.MAX_INPUT_LENGTH,
      feedbackEnabled: false,
      sourcesEnabled: Boolean((data.retriever_resource as { enabled?: boolean } | undefined)?.enabled),
    }
  }

  async chat(
    input: { message: string; conversationId: string; clientId: string },
    requestId: string,
    downstreamSignal: AbortSignal,
    onSettled: () => void = () => undefined,
  ) {
    const user = anonymousUser(input.clientId, this.config.ANONYMIZATION_SECRET)
    const upstreamController = new AbortController()
    const firstByteTimeout = setTimeout(
      () => upstreamController.abort('first-byte-timeout'),
      this.config.FIRST_BYTE_TIMEOUT_MS,
    )
    let totalTimeout: ReturnType<typeof setTimeout> | undefined
    const abortUpstream = () => upstreamController.abort('client-disconnected')
    downstreamSignal.addEventListener('abort', abortUpstream, { once: true })

    let taskId = ''
    let response: Response
    try {
      response = await fetch(`${this.config.DIFY_API_BASE}/chat-messages`, {
        method: 'POST',
        headers: { ...this.headers(), Accept: 'text/event-stream', 'X-Trace-Id': requestId },
        body: JSON.stringify({
          inputs: {},
          query: input.message,
          response_mode: 'streaming',
          conversation_id: input.conversationId,
          user,
          auto_generate_name: true,
        }),
        signal: upstreamController.signal,
      })
    } catch (error) {
      clearTimeout(firstByteTimeout)
      downstreamSignal.removeEventListener('abort', abortUpstream)
      onSettled()
      if (upstreamController.signal.reason === 'first-byte-timeout') {
        throw new DifyUpstreamError(
          'UPSTREAM_TIMEOUT',
          '回答等待时间有点长，请重新试一次。',
          504,
          'Dify first byte timeout',
        )
      }
      throw error
    }
    clearTimeout(firstByteTimeout)
    totalTimeout = setTimeout(() => upstreamController.abort('total-timeout'), this.config.UPSTREAM_TIMEOUT_MS)

    if (!response.ok || !response.body) {
      clearTimeout(totalTimeout)
      downstreamSignal.removeEventListener('abort', abortUpstream)
      onSettled()
      const serviceUnavailable = response.status >= 500
      throw new DifyUpstreamError(
        serviceUnavailable ? 'SERVICE_UNAVAILABLE' : 'UPSTREAM_ERROR',
        serviceUnavailable ? '服务正在休息，请稍后再试。' : 'AI 服务暂时没有正常返回。',
        serviceUnavailable ? 503 : 502,
        `Dify chat failed with ${response.status}`,
      )
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const reader = response.body.getReader()

    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        let buffer = ''
        let completed = false
        controller.enqueue(encoder.encode(encodeSse({ type: 'status', phase: 'routing', requestId })))
        try {
          while (true) {
            const { value, done } = await reader.read()
            buffer += decoder.decode(value, { stream: !done })
            const parsed = readFrames(buffer)
            buffer = parsed.remaining

            for (const frame of parsed.complete) {
              const event = parseDifyFrame(frame)
              if (!event) continue
              if (event.task_id && !taskId) {
                taskId = event.task_id
                controller.enqueue(encoder.encode(encodeSse({ type: 'status', phase: 'streaming', requestId, taskId })))
              }
              if (event.event === 'message' && event.answer) {
                controller.enqueue(encoder.encode(encodeSse({ type: 'delta', text: event.answer })))
              } else if (event.event === 'message_replace') {
                controller.enqueue(encoder.encode(encodeSse({ type: 'replace', text: event.answer ?? '' })))
              } else if (event.event === 'node_finished' && /安全风险|高风险|现实危险/.test(event.data?.title ?? '')) {
                controller.enqueue(encoder.encode(encodeSse({ type: 'safety', active: true })))
              } else if (event.event === 'message_end') {
                completed = true
                controller.enqueue(encoder.encode(encodeSse({
                  type: 'done',
                  taskId: event.task_id ?? taskId,
                  messageId: event.message_id ?? '',
                  conversationId: event.conversation_id ?? input.conversationId,
                  sources: safeSources(event.metadata?.retriever_resources),
                })))
              } else if (event.event === 'error') {
                completed = true
                controller.enqueue(encoder.encode(encodeSse({
                  type: 'error',
                  code: 'UPSTREAM_ERROR',
                  message: 'AI 服务暂时没有正常返回，请稍后再试。',
                  requestId,
                })))
              }
            }
            if (done) {
              if (buffer.trim()) {
                const event = parseDifyFrame(buffer)
                if (event?.event === 'message_end') {
                  completed = true
                  controller.enqueue(encoder.encode(encodeSse({
                    type: 'done',
                    taskId: event.task_id ?? taskId,
                    messageId: event.message_id ?? '',
                    conversationId: event.conversation_id ?? input.conversationId,
                    sources: safeSources(event.metadata?.retriever_resources),
                  })))
                } else if (event?.event === 'error') {
                  completed = true
                  controller.enqueue(encoder.encode(encodeSse({
                    type: 'error',
                    code: 'UPSTREAM_ERROR',
                    message: 'AI 服务暂时没有正常返回，请稍后再试。',
                    requestId,
                  })))
                }
              }
              break
            }
          }

          if (!completed && !downstreamSignal.aborted) {
            controller.enqueue(encoder.encode(encodeSse({
              type: 'error',
              code: 'EMPTY_RESPONSE',
              message: '这次没有收到完整回答，请重新试一次。',
              requestId,
            })))
          }
          controller.close()
        } catch {
          if (!downstreamSignal.aborted) {
            const timedOut = upstreamController.signal.reason === 'total-timeout'
            controller.enqueue(encoder.encode(encodeSse({
              type: 'error',
              code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
              message: timedOut
                ? '回答时间有点长，请重新试一次。'
                : '连接中断了，请重新试一次。',
              requestId,
            })))
          }
          controller.close()
        } finally {
          if (totalTimeout) clearTimeout(totalTimeout)
          downstreamSignal.removeEventListener('abort', abortUpstream)
          reader.releaseLock()
          onSettled()
          if (downstreamSignal.aborted && taskId) {
            void this.stop(taskId, input.clientId).catch(() => undefined)
          }
        }
      },
      cancel: () => upstreamController.abort('stream-cancelled'),
    })
  }

  async stop(taskId: string, clientId: string) {
    return fetch(`${this.config.DIFY_API_BASE}/chat-messages/${encodeURIComponent(taskId)}/stop`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ user: anonymousUser(clientId, this.config.ANONYMIZATION_SECRET) }),
    })
  }

  async deleteConversation(conversationId: string, clientId: string) {
    return fetch(`${this.config.DIFY_API_BASE}/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify({ user: anonymousUser(clientId, this.config.ANONYMIZATION_SECRET) }),
    })
  }
}
