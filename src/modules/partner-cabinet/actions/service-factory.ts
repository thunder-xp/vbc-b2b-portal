import {
  createAccessRequestService,
  createCompanyAccessService,
  createUserProfileService,
} from "../../access-control/actions/service-factory";
import { SupabaseRolePermissionRepository } from "../../access-control/repositories/supabase";
import { DefaultPermissionService } from "../../access-control/services/implementations";
import { getOneCEnv } from "../../../lib/env";
import { createPartnerLookupService } from "../../integration/services";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { SupabasePricingInventoryRepository } from "../../pricing-inventory/repositories/supabase";
import { DefaultPricingInventoryService } from "../../pricing-inventory/services";
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
  const companyAccessService = createCompanyAccessService();

  return new DefaultWorkspaceHomeService(
    createPartnerWorkspaceContextService(),
    new DefaultCatalogService(
      new SupabaseCatalogRepository(),
      companyAccessService,
    ),
    new DefaultPricingInventoryService(
      new SupabasePricingInventoryRepository(),
      companyAccessService,
      new DefaultPermissionService(new SupabaseRolePermissionRepository()),
    ),
  );
}
