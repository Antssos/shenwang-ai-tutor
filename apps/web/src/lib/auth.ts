import { apiBase } from './apiBase'

export interface AccountSession {
  authenticated: boolean
  username: string | null
}

async function readResponse(response: Response) {
  const payload = await response.json().catch(() => null) as (AccountSession & { message?: string }) | null
  if (!response.ok) throw new Error(payload?.message ?? '暂时无法完成，请稍后再试。')
  return payload
}

async function accountRequest(path: string, init: RequestInit = {}) {
  try {
    return await fetch(`${apiBase()}${path}`, { ...init, credentials: 'include' })
  } catch {
    throw new Error('暂时无法连接账号服务，请稍后再试。')
  }
}

export async function loadAccountSession(signal?: AbortSignal): Promise<AccountSession> {
  const response = await accountRequest('/api/v1/session', { signal })
  const payload = await readResponse(response)
  return payload ?? { authenticated: false, username: null }
}

export async function registerUser(username: string, password: string, inviteCode: string) {
  const response = await accountRequest('/api/v1/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password, inviteCode: inviteCode.trim() }),
  })
  const payload = await readResponse(response)
  if (!payload?.authenticated || !payload.username) throw new Error('注册没有成功，请重新尝试。')
  return payload.username
}

export async function loginUser(username: string, password: string) {
  const response = await accountRequest('/api/v1/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  })
  const payload = await readResponse(response)
  if (!payload?.authenticated || !payload.username) throw new Error('登录没有成功，请重新尝试。')
  return payload.username
}

export async function logoutUser() {
  await readResponse(await accountRequest('/api/v1/session', {
    method: 'DELETE',
  }))
}
