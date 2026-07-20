import { createCompanyAccessService, createPermissionService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { SupabaseEstimateRepository } from "../../estimates/repositories/supabase";
import { DefaultEstimateService } from "../../estimates/services";
import { SupabaseCartRepository, SupabasePartnerOrderHistoryRepository } from "../../orders/repositories/supabase";
import { DefaultCartService } from "../../orders/services";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabasePurchasingListRepository } from "../repositories/supabase";
import { PurchasingListService } from "../services";

export { getAuthenticatedUserId };

export function createPurchasingListService() {
  const companyAccess = createCompanyAccessService();
  const permission = createPermissionService();
  const pricing = createPricingInventoryService();
  const catalog = new DefaultCatalogService(new SupabaseCatalogRepository(), companyAccess, pricing);
  const cart = new DefaultCartService(new SupabaseCartRepository(), companyAccess, permission, catalog, pricing);
  const estimate = new DefaultEstimateService(new SupabaseEstimateRepository(), companyAccess, permission, catalog, pricing);
  return new PurchasingListService(
    new SupabasePurchasingListRepository(), companyAccess, permission, catalog, pricing,
    cart, new SupabasePartnerOrderHistoryRepository(), estimate,
  );
}
