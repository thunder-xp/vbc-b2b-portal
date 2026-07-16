import { createCompanyAccessService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { SupabaseRolePermissionRepository } from "../../access-control/repositories/supabase";
import { DefaultPermissionService } from "../../access-control/services/implementations";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseCartRepository } from "../../orders/repositories/supabase";
import { DefaultCartService } from "../../orders/services";
import { SupabaseEstimateLifecycleRepository, SupabaseEstimateRepository, SupabaseProposalRepository } from "../repositories/supabase";
import { DefaultEstimateService, DefaultProposalService, EstimateLifecycleService } from "../services";

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

export function createProposalService(): DefaultProposalService {
  return new DefaultProposalService(
    new SupabaseEstimateRepository(),
    new SupabaseProposalRepository(),
    createCompanyAccessService(),
    new DefaultPermissionService(new SupabaseRolePermissionRepository()),
  );
}

export function createEstimateLifecycleService(): EstimateLifecycleService {
  const companyAccessService = createCompanyAccessService();
  const permissionService = new DefaultPermissionService(new SupabaseRolePermissionRepository());
  const pricingInventoryService = createPricingInventoryService();
  const catalogService = new DefaultCatalogService(new SupabaseCatalogRepository(), companyAccessService, pricingInventoryService);
  const estimateRepository = new SupabaseEstimateRepository();
  const proposalRepository = new SupabaseProposalRepository();
  const proposalService = new DefaultProposalService(estimateRepository, proposalRepository, companyAccessService, permissionService);
  const cartService = new DefaultCartService(new SupabaseCartRepository(), companyAccessService, permissionService, catalogService, pricingInventoryService);
  return new EstimateLifecycleService(
    new SupabaseEstimateLifecycleRepository(), estimateRepository, proposalService, cartService,
    companyAccessService, permissionService, catalogService, pricingInventoryService,
  );
}
