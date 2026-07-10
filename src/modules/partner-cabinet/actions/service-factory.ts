import {
  createCompanyAccessService,
  createUserProfileService,
} from "../../access-control/actions/service-factory";
import { SupabaseRolePermissionRepository } from "../../access-control/repositories/supabase";
import { DefaultPermissionService } from "../../access-control/services/implementations";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { SupabasePricingInventoryRepository } from "../../pricing-inventory/repositories/supabase";
import { DefaultPricingInventoryService } from "../../pricing-inventory/services";
import { DefaultWorkspaceHomeService } from "../services";

export function createWorkspaceHomeService(): DefaultWorkspaceHomeService {
  const companyAccessService = createCompanyAccessService();

  return new DefaultWorkspaceHomeService(
    createUserProfileService(),
    companyAccessService,
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
