import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config.js'
import { anonymousUser, DifyService, DifyUpstreamError } from './dify.js'

const config = loadConfig({
  DIFY_API_BASE: 'http://dify.test/v1',
  DIFY_API_KEY: 'app-test-service-key',
  ANONYMIZATION_SECRET: 'test-only-anonymization-secret',
  INVITE_CODE: 'test-invite-code',
  FIRST_BYTE_TIMEOUT_MS: '1000',
  UPSTREAM_TIMEOUT_MS: '1000',
})

async function readText(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).text()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('anonymousUser', () => {
  it('creates a stable pseudonymous id without exposing the client id', () => {
    const first = anonymousUser('client-12345678', 'test-secret-value')
    const second = anonymousUser('client-12345678', 'test-secret-value')
    expect(first).toBe(second)
    expect(first).toMatch(/^web-[a-f0-9]{24}$/)
    expect(first).not.toContain('client-12345678')
  })

  it('forwards the final Dify frame even when it has no trailing blank line', async () => {
    const upstream = [
      'data: {"event":"message","task_id":"task-1","answer":"你好"}\n\n',
      'data: {"event":"message_end","task_id":"task-1","message_id":"message-1","conversation_id":"conversation-1","metadata":{"retriever_resources":[{"document_name":"儿童学习手册","document_id":"private-id"}]}}',
    ].join('')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(upstream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })))

    const settled = vi.fn()
    const stream = await new DifyService(config).chat(
      { message: '你好', conversationId: '', clientId: 'client-12345678' },
      'request-1',
      new AbortController().signal,
      settled,
    )
    const body = await readText(stream)

    expect(body).toContain('event: delta')
    expect(body).toContain('event: done')
    expect(body).toContain('儿童学习手册')
    expect(body).not.toContain('private-id')
    expect(settled).toHaveBeenCalledOnce()
  })

  it('maps an unavailable Dify service to a safe public error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })))

    await expect(new DifyService(config).chat(
      { message: '你好', conversationId: '', clientId: 'client-12345678' },
      'request-2',
      new AbortController().signal,
    )).rejects.toMatchObject<Partial<DifyUpstreamError>>({
      code: 'SERVICE_UNAVAILABLE',
      httpStatus: 503,
      safeMessage: '服务正在休息，请稍后再试。',
    })
  })
})
