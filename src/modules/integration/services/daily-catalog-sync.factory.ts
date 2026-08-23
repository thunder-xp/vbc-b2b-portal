import type { OneCEnv } from "../../../lib/env";
import { OneCNomenclatureODataProvider } from "../providers/one-c";
import { DailyCatalogSyncService, SupabaseCatalogSnapshotWriter } from "../sync";
import { createCatalogSynchronizationOrchestrator } from "./catalog-synchronization.factory";

export function createDailyCatalogSyncService(oneCEnv: OneCEnv) {
  return new DailyCatalogSyncService(
    new OneCNomenclatureODataProvider({ baseUrl: oneCEnv.baseUrl, username: oneCEnv.username, password: oneCEnv.password, requestTimeoutMs: oneCEnv.requestTimeoutMs }),
    new SupabaseCatalogSnapshotWriter(),
    createCatalogSynchronizationOrchestrator(),
  );
}

export function createDailyCatalogSyncStateReader() { return new SupabaseCatalogSnapshotWriter(); }
