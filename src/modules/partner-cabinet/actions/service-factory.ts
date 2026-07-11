import {
  createAccessRequestService,
  createCompanyAccessService,
  createUserProfileService,
} from "../../access-control/actions/service-factory";
import { SupabaseRolePermissionRepository } from "../../access-control/repositories/supabase";
import { DefaultPermissionService } from "../../access-control/services/implementations";
import { getOneCEnv } from "../../../lib/env";
import { createPartnerLookupService } from "../../integration/services";
import {
  DefaultPartnerWorkspaceContextService,
  DefaultWorkspaceHomeService,
} from "../services";

export function createPartnerWorkspaceContextService(): DefaultPartnerWorkspaceContextService {
  return new DefaultPartnerWorkspaceContextService(
    createUserProfileService(),
    createAccessRequestService(),
    createCompanyAccessService(),
    new DefaultPermissionService(new SupabaseRolePermissionRepository()),
    createPartnerLookupService(getOneCEnv()),
  );
}

export function createWorkspaceHomeService(): DefaultWorkspaceHomeService {
  return new DefaultWorkspaceHomeService(
    createPartnerWorkspaceContextService(),
  );
}
