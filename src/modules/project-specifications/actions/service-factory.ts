import { createCompanyAccessService } from "../../access-control/actions/service-factory";
import { SupabaseRolePermissionRepository } from "../../access-control/repositories/supabase";
import { DefaultPermissionService } from "../../access-control/services/implementations";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseProjectSpecificationRepository } from "../repositories/supabase";
import { DefaultProjectSpecificationService } from "../services";

export function createProjectSpecificationService(): DefaultProjectSpecificationService {
  const companyAccessService = createCompanyAccessService();
  return new DefaultProjectSpecificationService(
    new SupabaseProjectSpecificationRepository(),
    companyAccessService,
    new DefaultPermissionService(new SupabaseRolePermissionRepository()),
    new DefaultCatalogService(new SupabaseCatalogRepository(), companyAccessService),
    createPricingInventoryService(),
  );
}
