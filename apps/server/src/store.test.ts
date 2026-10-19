import { describe, expect, it } from 'vitest'
import { AppStore } from './store.js'

describe('persistent account store', () => {
  it('isolates accounts, sessions and conversations', () => {
    const store = new AppStore(':memory:')
    const first = store.createUser('小望', 'password-123')
    const second = store.createUser('小雨', 'password-456')
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(store.createUser('小望', 'another-password')).toBeNull()
    expect(store.authenticate('小望', 'password-123')).toEqual(first)
    expect(store.authenticate('小望', 'incorrect')).toBeNull()

    const session = store.createSession(first!.id, 1, 1_000)
    expect(store.findSession(session.token, 2_000)).toEqual(first)
    expect(store.findSession(session.token, 3_700_001)).toBeNull()

    store.saveConversation(first!.id, {
      id: 'chat-1',
      title: '数学问题',
      updatedAt: '2026-07-25T00:00:00.000Z',
      conversationId: 'dify-1',
      messages: [{ id: 'm1', role: 'user', content: '你好', status: 'complete' }],
    })
    expect(store.listConversations(first!.id)).toHaveLength(1)
    expect(store.listConversations(second!.id)).toEqual([])
  })
})
