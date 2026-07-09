import { SupabasePartnerCompanyRepository } from "../../access-control/repositories/supabase";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { SupabasePricingInventoryRepository } from "../../pricing-inventory/repositories/supabase";
import { DefaultPricingUpdaterService } from "../../pricing-inventory/services";
import type { OneCEnv } from "../../../lib/env";
import { OneCProvider } from "../providers/one-c";
import { DefaultPriceSyncEngine } from "../sync";

export function createPriceSyncEngine(oneCEnv: OneCEnv) {
  const provider = new OneCProvider({
    baseUrl: oneCEnv.baseUrl,
    apiToken: oneCEnv.apiToken,
    username: oneCEnv.username,
    password: oneCEnv.password,
    productPricesPath: oneCEnv.productPricesPath,
    useMockPricing: oneCEnv.useMockPricing,
  });
  const updater = new DefaultPricingUpdaterService(
    new SupabasePricingInventoryRepository(),
    new SupabaseCatalogRepository(),
    new SupabasePartnerCompanyRepository(),
  );

  return new DefaultPriceSyncEngine(provider, updater);
}
