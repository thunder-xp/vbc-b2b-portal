import "server-only";

import { SupabaseRetailMarketplaceRepository } from "./repositories/supabase/retail-marketplace.supabase-repository";
import { RetailInstallationPricingService } from "./services/retail-installation-pricing.service";
import { InstallationAssignmentDispatcher } from "./services/installation-assignment.service";

const repository = new SupabaseRetailMarketplaceRepository();
const pricingService = new RetailInstallationPricingService(repository);
const assignmentDispatcher = new InstallationAssignmentDispatcher(repository);
export function getRetailMarketplaceRepository() { return repository; }
export function getRetailInstallationPricingService() { return pricingService; }
export function getInstallationAssignmentDispatcher() { return assignmentDispatcher; }
