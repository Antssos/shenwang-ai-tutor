import { z } from 'zod'

export const teamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status'),
    phase: z.string(),
    requestId: z.string().optional(),
    taskId: z.string().optional(),
  }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('replace'), text: z.string() }),
  z.object({ type: z.literal('safety'), active: z.boolean() }),
  z.object({
    type: z.literal('done'),
    taskId: z.string(),
    messageId: z.string(),
    conversationId: z.string(),
    sources: z.array(z.object({ title: z.string() })).default([]),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
  }),
])

export type TeamEvent = z.infer<typeof teamEventSchema>

export interface ChatRequest {
  message: string
  conversationId: string
}

export const publicConfigSchema = z.object({
  appName: z.string(),
  openingStatement: z.string(),
  suggestedQuestions: z.array(z.string()),
  maxInputLength: z.number().int().positive(),
  feedbackEnabled: z.boolean(),
  sourcesEnabled: z.boolean(),
})

export type PublicConfig = z.infer<typeof publicConfigSchema>
