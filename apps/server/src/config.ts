import { z } from 'zod'

const envSchema = z.object({
  DIFY_API_BASE: z.string().url(),
  DIFY_API_KEY: z.string().min(12),
  ALLOWED_ORIGINS: z.string().default('http://127.0.0.1:4173'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MAX_INPUT_LENGTH: z.coerce.number().int().min(1).max(5000).default(1000),
  MAX_REQUEST_BODY_BYTES: z.coerce.number().int().min(1024).max(1_000_000).default(16_384),
  REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
  REQUESTS_PER_DAY: z.coerce.number().int().min(1).max(100_000).default(100),
  FIRST_BYTE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(120000),
  ANONYMIZATION_SECRET: z.string().min(24),
  INVITE_CODE: z.string().min(8),
  DATABASE_PATH: z.string().min(1).default('./data/wangxueban.sqlite'),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('wangxueban_session'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
})

export type AppConfig = ReturnType<typeof loadConfig>

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env)
  return {
    ...parsed,
    DIFY_API_BASE: parsed.DIFY_API_BASE.replace(/\/$/, ''),
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean),
    cookieSecure: parsed.COOKIE_SECURE === 'true',
  }
}
