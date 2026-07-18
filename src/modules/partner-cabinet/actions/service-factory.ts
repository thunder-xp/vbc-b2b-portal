import {
  createAccessRequestService,
  createCompanyAccessService,
  createPermissionService,
  createUserProfileService,
} from "../../access-control/actions/service-factory";
import { getOneCEnv } from "../../../lib/env";
import { createPartnerLookupService } from "../../integration/services";
import type { PartnerLookupService } from "../../integration/services";
import {
  DefaultPartnerWorkspaceContextService,
  DefaultWorkspaceHomeService,
} from "../services";

export function createPartnerWorkspaceContextService(): DefaultPartnerWorkspaceContextService {
  let partnerLookupService: PartnerLookupService | null = null;

  try {
    partnerLookupService = createPartnerLookupService(getOneCEnv());
  } catch {
    // Workspace access does not depend on live 1C availability. The service
    // still validates the portal-owned company and membership context.
  }

  return new DefaultPartnerWorkspaceContextService(
    createUserProfileService(),
    createAccessRequestService(),
    createCompanyAccessService(),
    createPermissionService(),
    partnerLookupService,
  );
}

export function createWorkspaceHomeService(): DefaultWorkspaceHomeService {
  return new DefaultWorkspaceHomeService(
    createPartnerWorkspaceContextService(),
  );
}
