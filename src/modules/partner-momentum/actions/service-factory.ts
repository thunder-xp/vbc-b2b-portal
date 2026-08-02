import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { SupabasePartnerMomentumProjectionRepository, SupabasePartnerMomentumRepository } from "../repositories";
import { PartnerMomentumProjectionService, PartnerMomentumService } from "../services";

export { getAuthenticatedUser } from "../../access-control/actions/service-factory";

export function createPartnerMomentumService(): PartnerMomentumService {
  return new PartnerMomentumService(new SupabasePartnerMomentumRepository(), createPartnerWorkspaceContextService());
}

export function createPartnerMomentumProjectionService(): PartnerMomentumProjectionService {
  return new PartnerMomentumProjectionService(new SupabasePartnerMomentumProjectionRepository());
}

