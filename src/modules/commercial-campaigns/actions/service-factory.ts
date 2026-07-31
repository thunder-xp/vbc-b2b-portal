import "server-only";

import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { SupabaseCommercialCampaignRepository } from "../repositories";
import { CommercialCampaignService } from "../services";

export function createCommercialCampaignService(): CommercialCampaignService {
  return new CommercialCampaignService(
    new SupabaseCommercialCampaignRepository(),
    createPartnerWorkspaceContextService(),
  );
}
