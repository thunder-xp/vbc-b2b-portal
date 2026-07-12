import type { OneCEnv } from "../../../lib/env";
import { OneCPriceChunkProvider } from "../providers/one-c";
import { ChunkedPriceSyncService, SupabasePriceSyncStateStore } from "../sync";

export function createChunkedPriceSyncService(env: OneCEnv) {
  return new ChunkedPriceSyncService(new OneCPriceChunkProvider({ baseUrl: env.baseUrl, username: env.username, password: env.password, requestTimeoutMs: env.requestTimeoutMs }), new SupabasePriceSyncStateStore());
}
