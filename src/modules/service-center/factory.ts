import "server-only";

import { createCompanyAccessService } from "@/src/modules/access-control/actions/service-factory";

import { ServiceCenterService } from "./service";
import { SupabaseServiceCenterRepository } from "./supabase.repository";

export function createServiceCenterService(): ServiceCenterService {
  return new ServiceCenterService(
    new SupabaseServiceCenterRepository(),
    createCompanyAccessService(),
  );
}
