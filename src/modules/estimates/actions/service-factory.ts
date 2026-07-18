import { createCompanyAccessService, createPermissionService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseCartRepository } from "../../orders/repositories/supabase";
import { DefaultCartService } from "../../orders/services";
import { SupabaseEstimateLifecycleRepository, SupabaseEstimateRepository, SupabaseProposalDeliveryRepository, SupabaseProposalRepository } from "../repositories/supabase";
import { DefaultEstimateService, DefaultProposalService, EstimateLifecycleService, ProposalDeliveryService, SmtpProposalEmailProvider } from "../services";

export { getAuthenticatedUserId };

export function createEstimateService(): DefaultEstimateService {
  const companyAccessService = createCompanyAccessService();
  const pricingInventoryService = createPricingInventoryService();
  return new DefaultEstimateService(
    new SupabaseEstimateRepository(),
    companyAccessService,
    createPermissionService(),
    new DefaultCatalogService(new SupabaseCatalogRepository(), companyAccessService, pricingInventoryService),
    pricingInventoryService,
  );
}

export function createProposalService(): DefaultProposalService {
  return new DefaultProposalService(
    new SupabaseEstimateRepository(),
    new SupabaseProposalRepository(),
    createCompanyAccessService(),
    createPermissionService(),
  );
}

export function createEstimateLifecycleService(): EstimateLifecycleService {
  const companyAccessService = createCompanyAccessService();
  const permissionService = createPermissionService();
  const pricingInventoryService = createPricingInventoryService();
  const catalogService = new DefaultCatalogService(new SupabaseCatalogRepository(), companyAccessService, pricingInventoryService);
  const estimateRepository = new SupabaseEstimateRepository();
  const proposalRepository = new SupabaseProposalRepository();
  const proposalService = new DefaultProposalService(estimateRepository, proposalRepository, companyAccessService, permissionService);
  const cartService = new DefaultCartService(new SupabaseCartRepository(), companyAccessService, permissionService, catalogService, pricingInventoryService);
  return new EstimateLifecycleService(
    new SupabaseEstimateLifecycleRepository(), new SupabaseProposalDeliveryRepository(), estimateRepository, proposalService, cartService,
    companyAccessService, permissionService, catalogService, pricingInventoryService,
  );
}

export function createProposalDeliveryService(): ProposalDeliveryService {
  const companyAccessService = createCompanyAccessService();
  const permissionService = createPermissionService();
  return new ProposalDeliveryService(
    new SupabaseProposalDeliveryRepository(), new SupabaseEstimateLifecycleRepository(), createProposalService(),
    new SmtpProposalEmailProvider(), companyAccessService, permissionService,
  );
}
