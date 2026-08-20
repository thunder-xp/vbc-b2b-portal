import { createCompanyAccessService } from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../../catalog/repositories/supabase";
import { DefaultCatalogService } from "../../catalog/services";
import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseWarehouseArrivalRepository } from "../repositories";
import { WarehouseArrivalService } from "../services";

export function createWarehouseArrivalService() {
  const pricing = createPricingInventoryService();
  return new WarehouseArrivalService(
    new SupabaseWarehouseArrivalRepository(),
    createPartnerWorkspaceContextService(),
    new DefaultCatalogService(
      new SupabaseCatalogRepository(),
      createCompanyAccessService(),
      pricing,
    ),
    pricing,
  );
}
