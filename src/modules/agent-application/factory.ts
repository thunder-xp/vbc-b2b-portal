import "server-only";

import { createAgentDomainService } from "@/src/modules/agent-domain";

import { SupabaseCommercialAgentApplicationRepository } from "./supabase.repository";
import { CommercialAgentApplicationService } from "./service";

export function createCommercialAgentApplicationService() {
  return new CommercialAgentApplicationService(
    new SupabaseCommercialAgentApplicationRepository(),
    createAgentDomainService(),
  );
}
