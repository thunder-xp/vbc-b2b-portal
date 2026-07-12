import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogUpdaterService } from "../../catalog/services";
import { OneCProvider } from "../providers/one-c";
import { DefaultCatalogSyncEngine, SupabaseCatalogSnapshotWriter } from "../sync";
import type { OneCEnv } from "../../../lib/env";

export function createCatalogSyncEngine(oneCEnv: OneCEnv) {
  const provider = new OneCProvider({
    baseUrl: oneCEnv.baseUrl,
    username: oneCEnv.username,
    password: oneCEnv.password,
    catalogCategoriesPath: oneCEnv.catalogCategoriesPath,
    catalogBrandsPath: oneCEnv.catalogBrandsPath,
    catalogProductsPath: oneCEnv.catalogProductsPath,
    useMockCatalog: oneCEnv.useMockCatalog,
  });
  const updater = new DefaultCatalogUpdaterService(
    new SupabaseCatalogRepository(),
  );

  return new DefaultCatalogSyncEngine(provider, updater, new SupabaseCatalogSnapshotWriter());
}

export function createCatalogSyncStateReader() {
  return new SupabaseCatalogSnapshotWriter();
}
