import "server-only";

import { SupabaseRetailMarketplaceRepository } from "./repositories/supabase/retail-marketplace.supabase-repository";
import { RetailInstallationPricingService } from "./services/retail-installation-pricing.service";
import { InstallationAssignmentDispatcher } from "./services/installation-assignment.service";
import { CctvObjectServicePricingService } from "./services/cctv-object-service-pricing.service";
import { PublicInstallationLeadService } from "./services/public-installation-lead.service";
import { SupabaseCctvObjectConfigurationRepository } from "../cctv-calculation/cctv-object-configuration.repository";

const repository = new SupabaseRetailMarketplaceRepository();
const pricingService = new RetailInstallationPricingService(repository);
const assignmentDispatcher = new InstallationAssignmentDispatcher(repository);
const cctvObjectServicePricing = new CctvObjectServicePricingService(new SupabaseCctvObjectConfigurationRepository());
const publicInstallationLeadService = new PublicInstallationLeadService(repository);
export function getRetailMarketplaceRepository() { return repository; }
export function getRetailInstallationPricingService() { return pricingService; }
export function getInstallationAssignmentDispatcher() { return assignmentDispatcher; }
export function getCctvObjectServicePricingService() { return cctvObjectServicePricing; }
export function getPublicInstallationLeadService() { return publicInstallationLeadService; }
