import { createCompanyAccessService, createPermissionService } from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseProjectSpecificationRepository } from "../repositories/supabase";
import {
  DefaultInternalSpecificationReviewService,
  DefaultProjectSpecificationService,
} from "../services";

export function createProjectSpecificationService(): DefaultProjectSpecificationService {
  const companyAccessService = createCompanyAccessService();
  return new DefaultProjectSpecificationService(
    new SupabaseProjectSpecificationRepository(),
    companyAccessService,
    createPermissionService(),
    new DefaultCatalogService(new SupabaseCatalogRepository(), companyAccessService),
    createPricingInventoryService(),
  );
}

export function createInternalSpecificationReviewService(): DefaultInternalSpecificationReviewService {
  return new DefaultInternalSpecificationReviewService(
    new SupabaseProjectSpecificationRepository(),
  );
}
