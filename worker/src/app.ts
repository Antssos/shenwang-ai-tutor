import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { secureHeaders } from 'hono/secure-headers'
import type { AppConfig } from './config.js'
import { constantTimeEqual } from './auth.js'
import { chatRequestSchema, conversationSchema, credentialsSchema, registerSchema } from './contracts.js'
import { createMinuteRateLimiter, createRateLimiter } from './rateLimit.js'
import { anonymousUser, DifyService, DifyUpstreamError } from './services/dify.js'
import { AppStore } from './store.js'
import type { Account } from './store.js'

type AppVariables = { account: Account }
type AppContext = Context<{ Variables: AppVariables }>

function jsonError(code: string, message: string, requestId = randomUUID()) {
  return { code, message, requestId }
}

export function createApp(config: AppConfig) {
  const app = new Hono<{ Variables: AppVariables }>()
  const dify = new DifyService(config)
  const store = new AppStore(config.DATABASE_PATH)
  const consumeRate = createMinuteRateLimiter(config.REQUESTS_PER_MINUTE)
  const consumeDailyRate = createRateLimiter(config.REQUESTS_PER_DAY, 24 * 60 * 60 * 1000)
  const consumeLoginAttempt = createMinuteRateLimiter(5)
  const activeClients = new Set<string>()

  app.use('*', secureHeaders())
  app.use('/api/*', cors({
    origin: (origin) => config.allowedOrigins.includes(origin) ? origin : '',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Accept'],
    credentials: true,
    maxAge: 600,
  }))

  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('origin')
    if (origin && !config.allowedOrigins.includes(origin)) {
      return c.json({ code: 'ORIGIN_NOT_ALLOWED', message: '该页面不能访问此服务。' }, 403)
    }
    await next()
  })

  function setSessionCookie(c: AppContext, token: string) {
    setCookie(c, config.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: config.cookieSecure ? 'None' : 'Lax',
      path: '/',
      maxAge: config.SESSION_TTL_HOURS * 60 * 60,
    })
  }

  function sessionAccount(c: AppContext) {
    return store.findSession(getCookie(c, config.SESSION_COOKIE_NAME))
  }

  async function requireAccount(c: AppContext, next: Next) {
    const account = sessionAccount(c)
    if (!account) return c.json(jsonError('AUTH_REQUIRED', '请登录后继续。'), 401)
    c.set('account', account)
    await next()
  }

  app.get('/healthz', (c) => c.json({ status: 'ok', service: 'wangxueban-bff' }))

  app.get('/api/v1/session', (c) => {
    const account = sessionAccount(c)
    return c.json({ authenticated: Boolean(account), username: account?.username ?? null })
  })

  app.post('/api/v1/register', async (c) => {
    const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    if (!consumeLoginAttempt(`register:${forwardedFor}`)) {
      return c.json(jsonError('RATE_LIMITED', '尝试次数过多，请一分钟后再试。'), 429)
    }
    const parsed = registerSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json(jsonError('INVALID_INPUT', '用户名需为 2–20 个字符，密码至少 8 个字符。'), 400)
    }
    if (!constantTimeEqual(parsed.data.inviteCode, config.INVITE_CODE)) {
      return c.json(jsonError('INVITE_DENIED', '邀请码不正确。'), 403)
    }
    const account = store.createUser(parsed.data.username, parsed.data.password)
    if (!account) return c.json(jsonError('USERNAME_TAKEN', '这个用户名已经注册，请直接登录。'), 409)
    const session = store.createSession(account.id, config.SESSION_TTL_HOURS)
    setSessionCookie(c, session.token)
    return c.json({ authenticated: true, username: account.username }, 201)
  })

  app.post('/api/v1/login', async (c) => {
    const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    if (!consumeLoginAttempt(`login:${forwardedFor}`)) {
      return c.json(jsonError('RATE_LIMITED', '尝试次数过多，请一分钟后再试。'), 429)
    }
    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json(jsonError('INVALID_INPUT', '请检查用户名和密码。'), 400)
    const account = store.authenticate(parsed.data.username, parsed.data.password)
    if (!account) return c.json(jsonError('LOGIN_DENIED', '用户名或密码不正确。'), 401)
    const session = store.createSession(account.id, config.SESSION_TTL_HOURS)
    setSessionCookie(c, session.token)
    return c.json({ authenticated: true, username: account.username })
  })

  app.delete('/api/v1/session', (c) => {
    const token = getCookie(c, config.SESSION_COOKIE_NAME)
    store.deleteSession(token)
    deleteCookie(c, config.SESSION_COOKIE_NAME, { path: '/' })
    return c.json({ authenticated: false, username: null })
  })

  app.use('/api/v1/chat/*', requireAccount)
  app.use('/api/v1/conversations/*', requireAccount)
  app.use('/api/v1/history/*', requireAccount)

  app.get('/api/v1/history', (c) => {
    return c.json({ conversations: store.listConversations(c.get('account').id) })
  })

  app.put('/api/v1/history/:id', async (c) => {
    const rawBody = await c.req.text()
    if (new TextEncoder().encode(rawBody).byteLength > 1_000_000) {
      return c.json(jsonError('HISTORY_TOO_LARGE', '这段对话过长，暂时无法保存。'), 413)
    }
    let body: unknown
    try {
      body = JSON.parse(rawBody || 'null')
    } catch {
      return c.json(jsonError('INVALID_HISTORY', '对话记录格式不正确。'), 400)
    }
    const parsed = conversationSchema.safeParse(body)
    if (!parsed.success || parsed.data.id !== c.req.param('id')) {
      return c.json(jsonError('INVALID_HISTORY', '对话记录格式不正确。'), 400)
    }
    store.saveConversation(c.get('account').id, parsed.data)
    return c.json({ saved: true })
  })

  app.delete('/api/v1/history/:id', (c) => {
    store.deleteConversation(c.get('account').id, c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.get('/api/v1/config', async (c) => {
    try {
      return c.json(await dify.publicConfig(c.req.raw.signal))
    } catch {
      return c.json({
        appName: '望学伴',
        openingStatement: '你好，我是望学伴。你可以问学习问题，也可以了解申望儿童关爱服务中心。',
        suggestedQuestions: [],
        maxInputLength: config.MAX_INPUT_LENGTH,
        feedbackEnabled: false,
        sourcesEnabled: false,
      })
    }
  })

  app.post('/api/v1/chat/stream', async (c) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    let body: unknown
    try {
      const rawBody = await c.req.text()
      if (new TextEncoder().encode(rawBody).byteLength > config.MAX_REQUEST_BODY_BYTES) {
        return c.json(jsonError('INPUT_TOO_LARGE', '内容有点长，请缩短后再发送。', requestId), 413)
      }
      body = JSON.parse(rawBody)
    } catch {
      return c.json(jsonError('INVALID_INPUT', '请检查输入内容后再试。', requestId), 400)
    }
    const parsed = chatRequestSchema.safeParse(body)
    if (!parsed.success) return c.json(jsonError('INVALID_INPUT', '请检查输入内容后再试。', requestId), 400)
    if (Array.from(parsed.data.message).length > config.MAX_INPUT_LENGTH) {
      return c.json(jsonError('INPUT_TOO_LARGE', '内容有点长，请缩短后再发送。', requestId), 413)
    }

    const account = c.get('account')
    const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    const anonymousClient = anonymousUser(account.id, config.ANONYMIZATION_SECRET)
    const rateKey = `${forwardedFor}:${anonymousClient}`
    if (!consumeRate(rateKey) || !consumeDailyRate(rateKey)) {
      return c.json(jsonError('RATE_LIMITED', '提问太快了，请稍等一会儿。', requestId), 429)
    }
    if (activeClients.has(anonymousClient)) {
      return c.json(jsonError('REQUEST_IN_PROGRESS', '上一条回答还没有结束，请稍等。', requestId), 409)
    }

    activeClients.add(anonymousClient)
    try {
      const stream = await dify.chat(
        { ...parsed.data, clientId: account.id },
        requestId,
        c.req.raw.signal,
        () => activeClients.delete(anonymousClient),
      )
      console.info(JSON.stringify({ event: 'chat_started', requestId, elapsedMs: Date.now() - startedAt }))
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          'X-Request-Id': requestId,
        },
      })
    } catch (error) {
      activeClients.delete(anonymousClient)
      console.error(JSON.stringify({
        event: 'chat_failed',
        requestId,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message.replace(/app-[A-Za-z0-9_-]+/g, 'app-***') : 'unknown',
      }))
      if (error instanceof DifyUpstreamError) {
        return c.json(jsonError(error.code, error.safeMessage, requestId), error.httpStatus)
      }
      return c.json(jsonError('UPSTREAM_ERROR', 'AI 服务暂时没有正常返回。', requestId), 502)
    }
  })

  app.post('/api/v1/chat/:taskId/stop', async (c) => {
    const requestId = randomUUID()
    try {
      const response = await dify.stop(c.req.param('taskId'), c.get('account').id)
      if (!response.ok) throw new Error(`stop failed with ${response.status}`)
      return c.json({ result: 'success', requestId })
    } catch {
      return c.json(jsonError('UPSTREAM_ERROR', '没有成功停止回答。', requestId), 502)
    }
  })

  app.delete('/api/v1/conversations/:conversationId', async (c) => {
    const requestId = randomUUID()
    try {
      const response = await dify.deleteConversation(c.req.param('conversationId'), c.get('account').id)
      if (!response.ok && response.status !== 404) throw new Error(`delete failed with ${response.status}`)
      return c.json({ result: 'success', requestId })
    } catch {
      return c.json(jsonError('UPSTREAM_ERROR', '没有成功清除云端会话。', requestId), 502)
    }
  })

  app.notFound((c) => c.json({ code: 'NOT_FOUND', message: '接口不存在。' }, 404))
  return app
}
