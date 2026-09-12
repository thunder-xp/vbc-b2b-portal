import "server-only";

import { createCompanyAccessService } from "@/src/modules/access-control/actions/service-factory";

import { SupabaseAccessRiskRepository } from "./repositories";
import { AccessRiskService } from "./services";

export function createAccessRiskService(): AccessRiskService {
  return new AccessRiskService(new SupabaseAccessRiskRepository(), createCompanyAccessService());
}
