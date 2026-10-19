import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAccountSession, loginUser, registerUser } from './auth'

describe('account authentication', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
  })

  it('registers through the server without storing the password in the browser', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      authenticated: true,
      username: '小望',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }))

    await expect(registerUser('小望', 'secret888', 'test-invite-code')).resolves.toBe('小望')
    const request = fetchMock.mock.calls[0]
    expect(request?.[0]).toBe('/api/v1/register')
    expect(request?.[1]).toMatchObject({ method: 'POST', credentials: 'include' })
  })

  it('returns server errors and restores a valid session', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: '用户名或密码不正确。' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, username: '小望' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    await expect(loginUser('小望', 'incorrect')).rejects.toThrow('用户名或密码不正确')
    await expect(loadAccountSession()).resolves.toEqual({ authenticated: true, username: '小望' })
  })
})
