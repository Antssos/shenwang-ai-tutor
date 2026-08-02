import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createOpaqueSessionToken, hashPassword, hashSessionToken, verifyPassword } from './auth.js'

export interface Account {
  id: string
  username: string
}

export interface StoredConversation {
  id: string
  title: string
  updatedAt: string
  conversationId: string
  messages: unknown[]
}

interface UserRow {
  id: string
  username: string
  password_salt: string
  password_hash: string
}

interface SessionRow {
  id: string
  username: string
}

interface ConversationRow {
  id: string
  title: string
  updated_at: string
  dify_conversation_id: string
  messages_json: string
}

function usernameKey(username: string) {
  return username.normalize('NFKC').toLocaleLowerCase('zh-CN')
}

export class AppStore {
  private readonly db: DatabaseSync

  constructor(databasePath: string) {
    if (databasePath !== ':memory:') {
      mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
      chmodSync(dirname(databasePath), 0o700)
    }
    this.db = new DatabaseSync(databasePath)
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_key TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        dify_conversation_id TEXT NOT NULL DEFAULT '',
        messages_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, user_id)
      );
      CREATE INDEX IF NOT EXISTS conversations_user_updated
        ON conversations(user_id, updated_at DESC);
    `)
    if (databasePath !== ':memory:') chmodSync(databasePath, 0o600)
  }

  createUser(username: string, password: string, now = new Date()): Account | null {
    const id = randomUUID()
    const { salt, hash } = hashPassword(password)
    try {
      this.db.prepare(`
        INSERT INTO users (id, username, username_key, password_salt, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, username, usernameKey(username), salt, hash, now.toISOString())
      return { id, username }
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return null
      throw error
    }
  }

  authenticate(username: string, password: string): Account | null {
    const row = this.db.prepare(`
      SELECT id, username, password_salt, password_hash
      FROM users WHERE username_key = ?
    `).get(usernameKey(username)) as unknown as UserRow | undefined
    if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) return null
    return { id: row.id, username: row.username }
  }

  createSession(userId: string, ttlHours: number, now = Date.now()) {
    const token = createOpaqueSessionToken()
    const expiresAt = now + ttlHours * 60 * 60 * 1000
    this.db.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(hashSessionToken(token), userId, expiresAt, new Date(now).toISOString())
    return { token, expiresAt }
  }

  findSession(token: string | undefined, now = Date.now()): Account | null {
    if (!token) return null
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
    const row = this.db.prepare(`
      SELECT users.id, users.username
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashSessionToken(token), now) as unknown as SessionRow | undefined
    return row ? { id: row.id, username: row.username } : null
  }

  deleteSession(token: string | undefined) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token))
  }

  listConversations(userId: string): StoredConversation[] {
    const rows = this.db.prepare(`
      SELECT id, title, updated_at, dify_conversation_id, messages_json
      FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50
    `).all(userId) as unknown as ConversationRow[]
    return rows.flatMap((row) => {
      try {
        const messages = JSON.parse(row.messages_json) as unknown
        if (!Array.isArray(messages)) return []
        return [{
          id: row.id,
          title: row.title,
          updatedAt: row.updated_at,
          conversationId: row.dify_conversation_id,
          messages,
        }]
      } catch {
        return []
      }
    })
  }

  saveConversation(userId: string, conversation: StoredConversation, now = new Date()) {
    const createdAt = now.toISOString()
    this.db.prepare(`
      INSERT INTO conversations (
        id, user_id, title, dify_conversation_id, messages_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, user_id) DO UPDATE SET
        title = excluded.title,
        dify_conversation_id = excluded.dify_conversation_id,
        messages_json = excluded.messages_json,
        updated_at = excluded.updated_at
    `).run(
      conversation.id,
      userId,
      conversation.title,
      conversation.conversationId,
      JSON.stringify(conversation.messages),
      createdAt,
      conversation.updatedAt,
    )
  }

  deleteConversation(userId: string, conversationId: string) {
    this.db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
      .run(conversationId, userId)
  }
}
