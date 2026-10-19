import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
process.umask(0o077);
const config = loadConfig(),
  app = createApp(config);
app.store.recover();
app.store.cleanup(config.RETENTION_DAYS);
const cleanup = setInterval(
  () => app.store.cleanup(config.RETENTION_DAYS),
  3600000,
);
cleanup.unref();
const server = serve(
  { fetch: app.fetch, hostname: config.HOST, port: config.PORT },
  () =>
    console.info(
      JSON.stringify({
        event: "started",
        port: config.PORT,
        provider: config.AI_PROVIDER,
      }),
    ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(cleanup);
    app.shutdown();
    server.close(() => {
      app.store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  });
