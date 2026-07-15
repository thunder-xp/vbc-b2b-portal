import { createCompanyAccessService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { SupabaseRolePermissionRepository } from "../../access-control/repositories/supabase";
import { DefaultPermissionService } from "../../access-control/services/implementations";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseEstimateRepository } from "../repositories/supabase";
import { DefaultEstimateService } from "../services";

export { getAuthenticatedUserId };

export function createEstimateService(): DefaultEstimateService {
  const companyAccessService = createCompanyAccessService();
  const pricingInventoryService = createPricingInventoryService();
  return new DefaultEstimateService(
    new SupabaseEstimateRepository(),
    companyAccessService,
    new DefaultPermissionService(new SupabaseRolePermissionRepository()),
    new DefaultCatalogService(new SupabaseCatalogRepository(), companyAccessService, pricingInventoryService),
    pricingInventoryService,
  );
}
