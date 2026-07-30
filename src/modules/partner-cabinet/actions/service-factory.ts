import {
  createAccessRequestService,
  createCompanyAccessService,
  createPermissionService,
  createUserProfileService,
} from "../../access-control/actions/service-factory";
import { SupabasePricingInventoryRepository } from "../../pricing-inventory/repositories/supabase";
import {
  DefaultPartnerWorkspaceContextService,
  DefaultWorkspaceHomeService,
} from "../services";
import { SupabaseCommercialFreshnessReadModel } from "../repositories/supabase-commercial-freshness.repository";
import { SupabaseWorkspaceDashboardRepository } from "../repositories/supabase-workspace-dashboard.repository";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabaseNotificationRepository } from "../../notifications";

const priceTypeRepository = new SupabasePricingInventoryRepository();
const workspaceContextService = new DefaultPartnerWorkspaceContextService(
  createUserProfileService(),
  createAccessRequestService(),
  createCompanyAccessService(),
  createPermissionService(),
  { findName: (reference) => priceTypeRepository.findPriceTypeName(reference) },
);

export function createPartnerWorkspaceContextService(): DefaultPartnerWorkspaceContextService {
  return workspaceContextService;
}

export function createWorkspaceHomeService(): DefaultWorkspaceHomeService {
  return new DefaultWorkspaceHomeService(
    createPartnerWorkspaceContextService(),
    new SupabaseCommercialFreshnessReadModel(),
    new SupabaseWorkspaceDashboardRepository(),
    createPricingInventoryService(),
    new SupabaseNotificationRepository(),
  );
}
