import "server-only";

import {
  CustomerIdentityResolutionService,
  SupabaseCustomerIdentityRepository,
} from "@/src/modules/customer-identity";

import { AgentDomainService } from "./service";
import { SupabaseAgentDomainRepository } from "./supabase.repository";

export function createAgentDomainService() {
  return new AgentDomainService(
    new SupabaseAgentDomainRepository(),
    new CustomerIdentityResolutionService(new SupabaseCustomerIdentityRepository()),
  );
}
