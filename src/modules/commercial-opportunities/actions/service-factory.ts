import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { SupabaseCommercialOpportunityRepository } from "../repositories";
import { CommercialOpportunityService } from "../services";

export { getAuthenticatedUserId } from "../../access-control/actions/service-factory";

export function createCommercialOpportunityService(): CommercialOpportunityService {
  return new CommercialOpportunityService(
    new SupabaseCommercialOpportunityRepository(),
    createPartnerWorkspaceContextService(),
  );
}
