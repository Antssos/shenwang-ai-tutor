import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadChatHistory, saveChatHistory } from './chatHistory'

describe('server chat history', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
  })

  it('loads conversations belonging to the signed-in account', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      conversations: [{
        id: 'chat-1',
        title: '数学问题',
        updatedAt: '2026-07-25T00:00:00.000Z',
        conversationId: 'dify-1',
        messages: [{ id: 'm1', role: 'user', content: '一道数学题', status: 'complete' }],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(loadChatHistory()).resolves.toHaveLength(1)
  })

  it('saves a conversation through the authenticated API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    await saveChatHistory({
      id: 'chat-1',
      title: '第一次提问',
      updatedAt: '2026-07-25T00:00:00.000Z',
      conversationId: '',
      messages: [{ id: 'm1', role: 'user', content: '第一次提问', status: 'complete' }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/history/chat-1',
      expect.objectContaining({ method: 'PUT', credentials: 'include' }),
    )
  })
})
