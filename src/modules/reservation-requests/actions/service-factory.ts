import { createCompanyAccessService } from "../../access-control/actions/service-factory";
import { SupabaseRolePermissionRepository } from "../../access-control/repositories/supabase";
import { DefaultPermissionService } from "../../access-control/services/implementations";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabasePricingInventoryRepository } from "../../pricing-inventory/repositories/supabase";
import { SupabaseProjectSpecificationRepository } from "../../project-specifications/repositories/supabase";
import { SupabaseReservationRequestRepository } from "../repositories/supabase";
import { DefaultInternalReservationReviewService, DefaultReservationRequestService } from "../services";

export function createReservationRequestService() {
  return new DefaultReservationRequestService(
    new SupabaseReservationRequestRepository(),
    new SupabaseProjectSpecificationRepository(),
    createCompanyAccessService(),
    new DefaultPermissionService(new SupabaseRolePermissionRepository()),
    createPricingInventoryService(),
  );
}

export function createInternalReservationReviewService() {
  return new DefaultInternalReservationReviewService(
    new SupabaseReservationRequestRepository(),
    new SupabaseProjectSpecificationRepository(),
    new SupabasePricingInventoryRepository(),
  );
}
