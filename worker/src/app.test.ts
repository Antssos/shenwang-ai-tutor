import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadConfig } from './config.js'

function testConfig() {
  return loadConfig({
    DIFY_API_BASE: 'http://127.0.0.1:8080/v1',
    DIFY_API_KEY: 'app-placeholder-key',
    ALLOWED_ORIGINS: 'http://app.example.test',
    DATABASE_PATH: ':memory:',
    ANONYMIZATION_SECRET: 'test-only-anonymization-secret',
    INVITE_CODE: 'test-invite-code',
    COOKIE_SECURE: 'false',
  })
}

describe('account and history API', () => {
  it('registers, restores a session and shares account history', async () => {
    const app = createApp(testConfig())
    const register = await app.request('/api/v1/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://app.example.test' },
      body: JSON.stringify({ username: '小望', password: 'password-123', inviteCode: 'test-invite-code' }),
    })
    expect(register.status).toBe(201)
    const cookie = register.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toContain('wangxueban_session=')

    const session = await app.request('/api/v1/session', { headers: { Cookie: cookie! } })
    await expect(session.json()).resolves.toMatchObject({ authenticated: true, username: '小望' })

    const conversation = {
      id: 'chat-1',
      title: '数学问题',
      updatedAt: '2026-07-25T00:00:00.000Z',
      conversationId: 'dify-1',
      messages: [{ id: 'm1', role: 'user', content: '你好', status: 'complete' }],
    }
    const save = await app.request('/api/v1/history/chat-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie! },
      body: JSON.stringify(conversation),
    })
    expect(save.status).toBe(200)

    const history = await app.request('/api/v1/history', { headers: { Cookie: cookie! } })
    const payload = await history.json() as { conversations: Array<{ title: string }> }
    expect(payload.conversations).toHaveLength(1)
    expect(payload.conversations[0]?.title).toBe('数学问题')
  })

  it('rejects an incorrect invitation code and unauthenticated history access', async () => {
    const app = createApp(testConfig())
    const register = await app.request('/api/v1/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '小望', password: 'password-123', inviteCode: '00000000' }),
    })
    expect(register.status).toBe(403)
    expect((await app.request('/api/v1/history')).status).toBe(401)
  })
})
