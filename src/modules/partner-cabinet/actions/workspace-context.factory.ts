import "server-only";

import { after } from "next/server";

import {
  createAccessRequestService,
  createCompanyAccessService,
  createPermissionService,
  createUserProfileService,
} from "../../access-control/actions/service-factory";
import {
  SupabasePartnerHistoryBootstrapEnsurer,
  SupabasePartnerPriceTypeReadModel,
} from "../repositories/supabase-partner-shell.repository";
import { DefaultPartnerWorkspaceContextService } from "../services";

const workspaceContextService = new DefaultPartnerWorkspaceContextService(
  createUserProfileService(),
  createAccessRequestService(),
  createCompanyAccessService(),
  createPermissionService(),
  new SupabasePartnerPriceTypeReadModel(),
  new SupabasePartnerHistoryBootstrapEnsurer(),
  async (task) => {
    after(task);
  },
);

export function createPartnerWorkspaceContextService(): DefaultPartnerWorkspaceContextService {
  return workspaceContextService;
}
