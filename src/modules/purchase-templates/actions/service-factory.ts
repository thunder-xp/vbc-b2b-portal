import { createCompanyAccessService, createPermissionService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { SupabaseCartRepository, SupabasePartnerOrderHistoryRepository } from "../../orders/repositories/supabase";
import { DefaultCartService } from "../../orders/services";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { createPurchasingListService } from "../../purchasing-lists/actions/service-factory";
import { SupabasePurchaseTemplateRepository } from "../repositories";
import { PurchaseTemplateService } from "../services";

export { getAuthenticatedUserId };

export function createPurchaseTemplateService() {
  const companyAccess = createCompanyAccessService();
  const permission = createPermissionService();
  const pricing = createPricingInventoryService();
  const catalog = new DefaultCatalogService(new SupabaseCatalogRepository(), companyAccess, pricing);
  const cart = new DefaultCartService(new SupabaseCartRepository(), companyAccess, permission, catalog, pricing);
  return new PurchaseTemplateService(
    new SupabasePurchaseTemplateRepository(),
    companyAccess,
    permission,
    catalog,
    pricing,
    cart,
    new SupabasePartnerOrderHistoryRepository(),
    createPurchasingListService(),
  );
}
