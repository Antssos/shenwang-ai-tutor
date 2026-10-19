import { z } from "zod";
import { resolve } from "node:path";
const schema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:3000"),
  DATABASE_PATH: z.string().default("./data/wangxueban.sqlite"),
  INVITE_CODE: z.string().min(12),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  AI_PROVIDER: z.enum(["openai", "disabled", "test"]).default("disabled"),
  ALLOW_TEST_PROVIDER: z.enum(["true", "false"]).default("false"),
  MODEL_API_BASE: z.string().url().default("https://api.deepseek.com/v1"),
  MODEL_API_KEY: z.string().default(""),
  MODEL_NAME: z.string().default(""),
  EMBEDDING_API_BASE: z.string().url().default("https://api.openai.com/v1"),
  EMBEDDING_API_KEY: z.string().default(""),
  EMBEDDING_MODEL: z.string().default(""),
  MAX_INPUT_LENGTH: z.coerce.number().int().min(1).max(5000).default(1000),
  MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4096).default(1024),
  DAILY_REQUESTS: z.coerce.number().int().positive().default(100),
  DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(100000),
  GLOBAL_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(200000),
  MAX_CONCURRENT: z.coerce.number().int().min(1).max(5).default(2),
  REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(180000)
    .default(90000),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = schema.parse(env);
  if (c.AI_PROVIDER === "openai" && (!c.MODEL_API_KEY || !c.MODEL_NAME))
    throw new Error("Model configuration incomplete");
  if (
    c.AI_PROVIDER === "test" &&
    (c.ALLOW_TEST_PROVIDER !== "true" ||
      !["127.0.0.1", "localhost"].includes(c.HOST))
  )
    throw new Error(
      "Test provider requires explicit opt-in and loopback binding",
    );
  if (c.COOKIE_SECURE === "true" && !c.APP_ORIGIN.startsWith("https:"))
    throw new Error("Secure cookies require HTTPS origin");
  for (const url of [c.MODEL_API_BASE, c.EMBEDDING_API_BASE]) {
    const u = new URL(url);
    if (
      u.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(u.hostname)
    )
      throw new Error("Provider endpoints require HTTPS");
  }
  return {
    ...c,
    APP_ORIGIN: new URL(c.APP_ORIGIN).origin,
    root: resolve(import.meta.dirname, "../../.."),
  };
}
export type AppConfig = ReturnType<typeof loadConfig>;
