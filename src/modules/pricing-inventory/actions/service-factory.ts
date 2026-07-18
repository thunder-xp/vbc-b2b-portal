import { createCompanyAccessService, createPermissionService, createUserProfileService } from "../../access-control/actions/service-factory";
import { SupabasePricingInventoryRepository } from "../repositories/supabase";
import {
  DefaultPricingInventoryService,
  CommercialRateManagementService,
  type PricingInventoryService,
} from "../services";

export function createPricingInventoryService(): PricingInventoryService {
  return new DefaultPricingInventoryService(
    new SupabasePricingInventoryRepository(),
    createCompanyAccessService(),
    createPermissionService(),
  );
}

export function createCommercialRateManagementService() {
  return new CommercialRateManagementService(
    new SupabasePricingInventoryRepository(),
    createUserProfileService(),
  );
}
