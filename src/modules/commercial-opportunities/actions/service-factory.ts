import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { SupabaseCommercialOpportunityRepository } from "../repositories";
import { CommercialOpportunityService } from "../services";
import { DefaultCatalogService } from "../../catalog/services";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { createCompanyAccessService } from "../../access-control/actions/service-factory";

export { getAuthenticatedUserId } from "../../access-control/actions/service-factory";

export function createCommercialOpportunityService(): CommercialOpportunityService {
  return new CommercialOpportunityService(
    new SupabaseCommercialOpportunityRepository(),
    createPartnerWorkspaceContextService(),
    new DefaultCatalogService(new SupabaseCatalogRepository(), createCompanyAccessService()),
  );
}
