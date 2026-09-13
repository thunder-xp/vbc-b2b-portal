import "server-only";

import { unstable_cache } from "next/cache";
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
import type { PublicRetailListInput } from "./services/public-retail.service";
import type { EffectiveRollingPeriod } from "../commerce-period";

const PUBLIC_RETAIL_CACHE_SECONDS = 300;
const PUBLIC_RETAIL_CACHE_TAG = "public-retail-publication";

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

const cachedCategories = unstable_cache(
  (locale: PublicRetailLocale) => service.listRetailCategories(locale),
  ["public-retail-categories-v1"],
  { revalidate: PUBLIC_RETAIL_CACHE_SECONDS, tags: [PUBLIC_RETAIL_CACHE_TAG] },
);
const cachedProduct = unstable_cache(
  (slug: string, locale: PublicRetailLocale) => service.getRetailProduct(slug, locale),
  ["public-retail-product-v1"],
  { revalidate: PUBLIC_RETAIL_CACHE_SECONDS, tags: [PUBLIC_RETAIL_CACHE_TAG] },
);
const cachedRelatedProducts = unstable_cache(
  (slug: string, locale: PublicRetailLocale) => service.listRelatedProducts(slug, locale, 6),
  ["public-retail-related-v1"],
  { revalidate: PUBLIC_RETAIL_CACHE_SECONDS, tags: [PUBLIC_RETAIL_CACHE_TAG] },
);
const cachedProducts = unstable_cache(
  (input: string) => service.listRetailProducts(JSON.parse(input) as PublicRetailListInput),
  ["public-retail-list-v1"],
  { revalidate: PUBLIC_RETAIL_CACHE_SECONDS, tags: [PUBLIC_RETAIL_CACHE_TAG] },
);
const cachedFacets = unstable_cache(
  (input: string) => service.listRetailFacets(JSON.parse(input) as PublicRetailListInput),
  ["public-retail-facets-v1"],
  { revalidate: PUBLIC_RETAIL_CACHE_SECONDS, tags: [PUBLIC_RETAIL_CACHE_TAG] },
);
const cachedShowcase = unstable_cache(
  (locale: PublicRetailLocale, rotationSeed: string, periods: { popular: EffectiveRollingPeriod; new: EffectiveRollingPeriod; hot: EffectiveRollingPeriod }) =>
    service.getRetailShowcase(locale, rotationSeed, periods),
  ["public-retail-showcase-v1"],
  { revalidate: PUBLIC_RETAIL_CACHE_SECONDS, tags: [PUBLIC_RETAIL_CACHE_TAG] },
);

export const getPublicRetailCategories = cache((locale: PublicRetailLocale) => cachedCategories(locale));
export const getPublicRetailProduct = cache((slug: string, locale: PublicRetailLocale) => cachedProduct(slug, locale));
export const getPublicRetailRelatedProducts = cache((slug: string, locale: PublicRetailLocale) => cachedRelatedProducts(slug, locale));
export const getPublicRetailProducts = cache((input: PublicRetailListInput) => cachedProducts(stableCatalogInput(input)));
export const getPublicRetailFacets = cache((input: PublicRetailListInput) => cachedFacets(stableCatalogInput(input)));
export const getPublicRetailCategoryFacets = cache((categorySlug: string, locale: PublicRetailLocale) =>
  cachedFacets(stableCatalogInput({ categorySlug, locale })));
export const getPublicRetailShowcase = cache((
  locale: PublicRetailLocale,
  rotationSeed: string,
  periods: { popular: EffectiveRollingPeriod; new: EffectiveRollingPeriod; hot: EffectiveRollingPeriod },
) => cachedShowcase(locale, rotationSeed, periods));

function stableCatalogInput(input: PublicRetailListInput): string {
  const facets = input.facets
    ? Object.fromEntries(Object.entries(input.facets).sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => [key, [...new Set(values)].sort()]))
    : undefined;
  return JSON.stringify({
    locale: input.locale,
    categorySlug: input.categorySlug,
    search: input.search,
    availability: input.availability,
    facets,
    page: input.page,
    pageSize: input.pageSize,
    mode: input.mode,
    period: input.period,
  });
}
