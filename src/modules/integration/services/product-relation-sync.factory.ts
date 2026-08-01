import "server-only";

import { getOneCEnv } from "@/src/lib/env";
import { OneCODataClient, OneCProductRelationProvider } from "../providers/one-c";
import { ProductRelationSyncService } from "../sync/product-relation-sync.service";

export function createProductRelationSyncService(): ProductRelationSyncService {
  const config = getOneCEnv();
  const client = new OneCODataClient({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
    requestTimeoutMs: config.requestTimeoutMs,
  });
  return new ProductRelationSyncService(new OneCProductRelationProvider(client));
}
