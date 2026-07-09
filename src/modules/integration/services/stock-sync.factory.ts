import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { SupabasePricingInventoryRepository } from "../../pricing-inventory/repositories/supabase";
import { DefaultInventoryUpdaterService } from "../../pricing-inventory/services";
import type { OneCEnv } from "../../../lib/env";
import { OneCProvider } from "../providers/one-c";
import { DefaultStockSyncEngine } from "../sync";

export function createStockSyncEngine(oneCEnv: OneCEnv) {
  const provider = new OneCProvider({
    baseUrl: oneCEnv.baseUrl,
    apiToken: oneCEnv.apiToken,
    username: oneCEnv.username,
    password: oneCEnv.password,
    stockBalancesPath: oneCEnv.stockBalancesPath,
    useMockInventory: oneCEnv.useMockInventory,
  });
  const updater = new DefaultInventoryUpdaterService(
    new SupabasePricingInventoryRepository(),
    new SupabaseCatalogRepository(),
  );

  return new DefaultStockSyncEngine(provider, updater);
}
