import "server-only";

import { cache } from "react";

import { SupabasePublicRetailReadRepository } from "./repositories/supabase/public-retail.supabase-repository";
import { PublicCctvCalculatorService } from "./services/public-cctv-calculator.service";
import { getCctvObjectServicePricingService } from "@/src/modules/retail-marketplace/server";
import { PublicRetailService } from "./services/public-retail.service";
import { PublicPartnerDirectoryService } from "./services/public-partner-directory.service";
import type { PublicRetailLocale } from "./types";
import { SupabaseCctvCameraCandidateRepository } from "../cctv-calculation/cctv-camera-candidate.repository";
import { SupabaseCctvObjectConfigurationRepository } from "../cctv-calculation/cctv-object-configuration.repository";
import { SupabasePublicPartnerDirectoryRepository } from "./repositories/supabase/public-partner-directory.supabase-repository";

const service = new PublicRetailService(new SupabasePublicRetailReadRepository());
const partnerDirectory = new PublicPartnerDirectoryService(new SupabasePublicPartnerDirectoryRepository());
const calculator = new PublicCctvCalculatorService(
  new SupabasePublicRetailReadRepository(),
  getCctvObjectServicePricingService(),
  new SupabaseCctvCameraCandidateRepository(),
);

export function getPublicRetailService(): PublicRetailService {
  return service;
}
export function getPublicPartnerDirectoryService(): PublicPartnerDirectoryService {
  return partnerDirectory;
}
export function getPublicCctvCalculatorService(): PublicCctvCalculatorService {
  return calculator;
}
export const getPublicCctvServiceOptions = cache(() => new SupabaseCctvObjectConfigurationRepository().listPublicOptions());
export const getPublicRetailCategories = cache((locale: PublicRetailLocale) =>
  service.listRetailCategories(locale));
export const getPublicRetailProduct = cache((slug: string, locale: PublicRetailLocale) =>
  service.getRetailProduct(slug, locale));
export const getPublicRetailRelatedProducts = cache((slug: string, locale: PublicRetailLocale) =>
  service.listRelatedProducts(slug, locale, 6));
export const getPublicRetailCategoryFacets = cache((categorySlug: string, locale: PublicRetailLocale) =>
  service.listRetailFacets({ categorySlug, locale }));
