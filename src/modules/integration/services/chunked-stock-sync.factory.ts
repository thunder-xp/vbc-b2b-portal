import type { OneCEnv } from "../../../lib/env";
import { OneCStockBalanceProvider, OneCSupplierArrivalProvider } from "../providers/one-c";
import { ChunkedStockSyncService, SupabaseStockSyncStore } from "../sync";
import { createCatalogSynchronizationOrchestrator } from "./catalog-synchronization.factory";
export function createChunkedStockSyncService(env:OneCEnv){const config={baseUrl:env.baseUrl,username:env.username,password:env.password,requestTimeoutMs:env.requestTimeoutMs};return new ChunkedStockSyncService(new OneCStockBalanceProvider(config),new OneCSupplierArrivalProvider(config),new SupabaseStockSyncStore(),Date.now,createCatalogSynchronizationOrchestrator());}
