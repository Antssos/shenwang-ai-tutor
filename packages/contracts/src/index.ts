import { z } from 'zod'
export const routeSchema=z.enum(['study_question','center_information','general_chat','emotional_support','safety_risk','unsupported'])
export type Route=z.infer<typeof routeSchema>
export const sourceSchema=z.object({title:z.string(),documentId:z.string().optional(),version:z.string().optional(),section:z.string().optional(),chunkId:z.string().optional()})
export const messageSchema=z.object({id:z.string(),role:z.enum(['user','assistant']),content:z.string(),status:z.enum(['streaming','complete','stopped','error']),sources:z.array(sourceSchema).optional()})
export type ChatMessage=z.infer<typeof messageSchema>
export interface SavedConversation {id:string;title:string;updatedAt:string;conversationId:string;messages:ChatMessage[]}
export const chatRequestSchema=z.object({message:z.string().trim().min(1).max(5000),conversationId:z.string().max(128).default(''),requestId:z.string().min(1).max(128),editMessageId:z.string().max(128).optional()})
export type ChatRequest=z.infer<typeof chatRequestSchema>
export const credentialsSchema=z.object({username:z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N}_-]+$/u),password:z.string().min(8).max(64)})
export const registerSchema=credentialsSchema.extend({inviteCode:z.string().min(1).max(128)})
export const teamEventSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('status'),phase:z.string(),requestId:z.string().optional(),taskId:z.string().optional(),conversationId:z.string().optional(),userMessageId:z.string().optional(),messageId:z.string().optional()}),
 z.object({type:z.literal('delta'),text:z.string()}),z.object({type:z.literal('replace'),text:z.string()}),z.object({type:z.literal('safety'),active:z.boolean()}),
 z.object({type:z.literal('done'),taskId:z.string(),messageId:z.string(),conversationId:z.string(),sources:z.array(sourceSchema).default([]),status:z.enum(['complete','stopped','error']).optional(),route:routeSchema.optional()}),
 z.object({type:z.literal('error'),code:z.string(),message:z.string(),requestId:z.string().optional()})
])
export type TeamEvent=z.infer<typeof teamEventSchema>
export const publicConfigSchema=z.object({appName:z.string(),openingStatement:z.string(),suggestedQuestions:z.array(z.string()),maxInputLength:z.number().int().positive(),feedbackEnabled:z.boolean(),sourcesEnabled:z.boolean(),providerStatus:z.enum(['ready','disabled','test']).optional()})
export type PublicConfig=z.infer<typeof publicConfigSchema>
