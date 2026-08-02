import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config.js'

process.umask(0o077)
const config = loadConfig()
const app = createApp(config)

serve({ fetch: app.fetch, hostname: config.HOST, port: config.PORT }, (info) => {
  console.info(`望学伴 BFF 已启动：http://${info.address}:${info.port}`)
})
