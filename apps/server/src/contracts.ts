import { z } from 'zod'

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1),
  conversationId: z.string().max(128).default(''),
})

export const credentialsSchema = z.object({
  username: z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N}_-]+$/u),
  password: z.string().min(8).max(64),
})

export const registerSchema = credentialsSchema.extend({
  inviteCode: z.string().trim().min(1).max(128),
})

export const messageSchema = z.object({
  id: z.string().min(1).max(128),
  role: z.enum(['user', 'assistant']),
  content: z.string().max(20_000),
  status: z.enum(['streaming', 'complete', 'stopped', 'error']),
  sources: z.array(z.object({ title: z.string().max(300) })).max(50).optional(),
})

export const conversationSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(80),
  updatedAt: z.string().datetime(),
  conversationId: z.string().max(128),
  messages: z.array(messageSchema).max(200),
})

export type TeamEvent =
  | { type: 'status'; phase: string; requestId?: string; taskId?: string }
  | { type: 'delta'; text: string }
  | { type: 'replace'; text: string }
  | { type: 'safety'; active: boolean }
  | {
      type: 'done'
      taskId: string
      messageId: string
      conversationId: string
      sources: Array<{ title: string }>
    }
  | { type: 'error'; code: string; message: string; requestId?: string }
