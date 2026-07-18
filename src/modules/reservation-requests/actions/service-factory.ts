import { createCompanyAccessService, createPermissionService } from "../../access-control/actions/service-factory";
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
    createPermissionService(),
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
