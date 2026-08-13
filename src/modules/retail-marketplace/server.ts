import "server-only";

import { SupabaseRetailMarketplaceRepository } from "./repositories/supabase/retail-marketplace.supabase-repository";
import { RetailInstallationPricingService } from "./services/retail-installation-pricing.service";

const repository = new SupabaseRetailMarketplaceRepository();
const pricingService = new RetailInstallationPricingService(repository);
export function getRetailMarketplaceRepository() { return repository; }
export function getRetailInstallationPricingService() { return pricingService; }
