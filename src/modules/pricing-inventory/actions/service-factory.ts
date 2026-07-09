import { createCompanyAccessService } from "../../access-control/actions/service-factory";
import { SupabaseRolePermissionRepository } from "../../access-control/repositories/supabase";
import { DefaultPermissionService } from "../../access-control/services/implementations";
import { SupabasePricingInventoryRepository } from "../repositories/supabase";
import {
  DefaultPricingInventoryService,
  type PricingInventoryService,
} from "../services";

export function createPricingInventoryService(): PricingInventoryService {
  return new DefaultPricingInventoryService(
    new SupabasePricingInventoryRepository(),
    createCompanyAccessService(),
    new DefaultPermissionService(new SupabaseRolePermissionRepository()),
  );
}
