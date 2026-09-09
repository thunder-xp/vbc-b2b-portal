import type { OneCEnv } from "../../../lib/env";
import { OneCNomenclatureODataProvider, OneCProductNewProvider } from "../providers/one-c";
import { DailyCatalogSyncService, SupabaseCatalogSnapshotWriter, SupabaseProductNewFactsWriter } from "../sync";
import { createCatalogSynchronizationOrchestrator } from "./catalog-synchronization.factory";

export function createDailyCatalogSyncService(oneCEnv: OneCEnv) {
  return new DailyCatalogSyncService(
    new OneCNomenclatureODataProvider({ baseUrl: oneCEnv.baseUrl, username: oneCEnv.username, password: oneCEnv.password, requestTimeoutMs: oneCEnv.requestTimeoutMs }),
    new SupabaseCatalogSnapshotWriter(),
    createCatalogSynchronizationOrchestrator(),
    new OneCProductNewProvider({ baseUrl: oneCEnv.baseUrl, username: oneCEnv.username, password: oneCEnv.password, requestTimeoutMs: oneCEnv.requestTimeoutMs }),
    new SupabaseProductNewFactsWriter(),
  );
}

export function createDailyCatalogSyncStateReader() { return new SupabaseCatalogSnapshotWriter(); }
