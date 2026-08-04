import {
  createAccessRequestService,
  createCompanyAccessService,
  createPermissionService,
  createUserProfileService,
} from "../../access-control/actions/service-factory";
import { SupabasePricingInventoryRepository } from "../../pricing-inventory/repositories/supabase";
import {
  DefaultPartnerWorkspaceContextService,
  DefaultWorkspaceHomeService,
} from "../services";
import { SupabaseCommercialFreshnessReadModel } from "../repositories/supabase-commercial-freshness.repository";
import { SupabaseWorkspaceDashboardRepository } from "../repositories/supabase-workspace-dashboard.repository";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseCommercialOpportunityRepository } from "../../commercial-opportunities";
import { SupabaseCommercialCampaignRepository } from "../../commercial-campaigns/repositories/supabase-commercial-campaign.repository";
import { DefaultCatalogService } from "../../catalog/services";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { SupabaseOrderHistoryBootstrapRepository } from "../../orders/repositories/supabase";
import { SupabasePartnerSupportRepository } from "../../partner-support";

const priceTypeRepository = new SupabasePricingInventoryRepository();
const workspaceContextService = new DefaultPartnerWorkspaceContextService(
  createUserProfileService(),
  createAccessRequestService(),
  createCompanyAccessService(),
  createPermissionService(),
  { findName: (reference) => priceTypeRepository.findPriceTypeName(reference) },
  new SupabaseOrderHistoryBootstrapRepository(),
);

export function createPartnerWorkspaceContextService(): DefaultPartnerWorkspaceContextService {
  return workspaceContextService;
}

export function createWorkspaceHomeService(): DefaultWorkspaceHomeService {
  const catalogService = new DefaultCatalogService(
    new SupabaseCatalogRepository(),
    createCompanyAccessService(),
  );
  return new DefaultWorkspaceHomeService(
    createPartnerWorkspaceContextService(),
    new SupabaseCommercialFreshnessReadModel(),
    new SupabaseWorkspaceDashboardRepository(),
    createPricingInventoryService(),
    undefined,
    new SupabaseCommercialOpportunityRepository(),
    new SupabaseCommercialCampaignRepository(),
    undefined,
    catalogService,
    undefined,
    new SupabasePartnerSupportRepository(),
  );
}
