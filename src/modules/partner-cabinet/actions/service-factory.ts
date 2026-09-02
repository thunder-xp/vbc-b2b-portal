import {
  createCompanyAccessService,
} from "../../access-control/actions/service-factory";
import {
  DefaultWorkspaceHomeService,
} from "../services";
import { SupabaseCommercialFreshnessReadModel } from "../repositories/supabase-commercial-freshness.repository";
import { SupabaseWorkspaceDashboardRepository } from "../repositories/supabase-workspace-dashboard.repository";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseCommercialOpportunityRepository } from "../../commercial-opportunities";
import { SupabaseCommercialCampaignRepository } from "../../commercial-campaigns/repositories/supabase-commercial-campaign.repository";
import { DefaultCatalogService } from "../../catalog/services";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { SupabasePartnerSupportRepository } from "../../partner-support";
import { createPartnerWorkspaceContextService } from "./workspace-context.factory";
import { PartnerSalesWorkspaceService, SupabaseEstimateSalesOpportunityRepository } from "../../partner-sales-workspace";

export { createPartnerWorkspaceContextService } from "./workspace-context.factory";

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
    new PartnerSalesWorkspaceService(new SupabaseEstimateSalesOpportunityRepository()),
  );
}
