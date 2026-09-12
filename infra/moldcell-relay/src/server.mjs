import { loadConfig } from "./config.mjs";
import { createRelayApplication } from "./application.mjs";
import { createRelayHttpServer } from "./http-server.mjs";
import { DurableRelayStore } from "./store.mjs";

const config = loadConfig();
const store = new DurableRelayStore({
  databasePath: config.databasePath,
  rateLimitPerMinute: config.rateLimitPerMinute,
  idempotencyTtlSeconds: config.idempotencyTtlSeconds,
  replayWindowSeconds: config.replayWindowSeconds,
});
const application = createRelayApplication({ config, store });
const server = createRelayHttpServer(application, config);

server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "relay_started",
    service: "nsd-sms-relay",
    version: config.version,
    bindAddress: config.host,
    port: config.port,
    ready: config.authenticationConfigured && config.providerConfigured,
  }));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
