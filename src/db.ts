import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "./env.js";

// Banco local do docker-compose: o driver fala com o proxy em http://db.localtest.me:4444.
if (env.databaseUrl.includes("db.localtest.me")) {
  neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = (host) => `${host}:4444/v2`;
}

let client: NeonQueryFunction<false, false> | null = null;

export function sql() {
  client ??= neon(env.databaseUrl);
  return client;
}
