import type { PublicRetailReadRepository } from "../repositories/public-retail.repository";
import {
  PUBLIC_RETAIL_AVAILABILITY,
  PUBLIC_RETAIL_LOCALES,
  type PublicRetailAvailability,
  type PublicRetailCatalogMode,
  type PublicRetailLocale,
} from "../types";

export type PublicRetailListInput = {
  locale?: string;
  categorySlug?: string;
  search?: string;
  availability?: string;
  facets?: Record<string, string[]>;
  page?: number;
  pageSize?: number;
  mode?: string;
};

export class PublicRetailService {
  constructor(private readonly repository: PublicRetailReadRepository) {}

  listRetailCategories(locale?: string) {
    return this.repository.listCategories(normalizeLocale(locale));
  }

  getRetailShowcase(locale?: string) {
    return this.repository.getShowcase(normalizeLocale(locale));
  }

  async getRetailCategory(slug: string, locale?: string) {
    const normalizedSlug = normalizeSlug(slug);
    return (await this.repository.listCategories(normalizeLocale(locale)))
      .find((category) => category.slug === normalizedSlug) ?? null;
  }

  listRetailProducts(input: PublicRetailListInput = {}) {
    const pageSize = integerInRange(input.pageSize, 24, 1, 48);
    const page = integerInRange(input.page, 1, 1, 209);
    return this.repository.listProducts({
      locale: normalizeLocale(input.locale),
      categorySlug: optionalSlug(input.categorySlug),
      search: normalizeSearch(input.search),
      availability: normalizeAvailability(input.availability),
      facets: normalizeFacets(input.facets),
      mode: normalizeMode(input.mode, Boolean(normalizeSearch(input.search))),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  }

  searchRetailProducts(query: string, input: Omit<PublicRetailListInput, "search"> = {}) {
    return this.listRetailProducts({ ...input, search: query });
  }

  getRetailProduct(slug: string, locale?: string) {
    return this.repository.getProduct(normalizeSlug(slug), normalizeLocale(locale));
  }

  listRelatedProducts(slug: string, locale?: string, limit = 6) {
    return this.repository.listRelatedProducts(
      normalizeSlug(slug),
      normalizeLocale(locale),
      integerInRange(limit, 6, 1, 6),
    );
  }

  listRetailFacets(input: Pick<PublicRetailListInput, "availability" | "categorySlug" | "facets" | "locale" | "search"> = {}) {
    return this.repository.listFacets({
      availability: normalizeAvailability(input.availability),
      categorySlug: optionalSlug(input.categorySlug),
      facets: normalizeFacets(input.facets),
      locale: normalizeLocale(input.locale),
      search: normalizeSearch(input.search),
    });
  }

  resolveCalculatorProducts(profileKeys: string[], locale?: string) {
    const normalized = [...new Set(profileKeys.map((key) => key.trim()))];
    if (normalized.length < 1 || normalized.length > 30
      || normalized.some((key) => !/^cctv\.[a-z0-9]+(?:\.[a-z0-9]+)*$/.test(key) || key.length > 100)) {
      throw new Error("Invalid Public Retail calculator profiles.");
    }
    return this.repository.resolveCalculatorProducts(normalized, normalizeLocale(locale));
  }
}

function normalizeMode(value: string | undefined, searchActive: boolean): PublicRetailCatalogMode | undefined {
  if (searchActive) return undefined;
  return (["popular", "new", "hot", "special", "replenishment", "price_asc", "price_desc"] as const).find((candidate) => candidate === value);
}

function normalizeFacets(value: Record<string, string[]> | undefined): Record<string, string[]> | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value);
  if (entries.length > 8) throw new Error("Too many Public Retail facets.");
  const normalized = Object.fromEntries(entries.map(([key, selected]) => {
    const normalizedKey = key.trim();
    const normalizedValues = [...new Set(selected.map((item) => item.trim()).filter(Boolean))];
    if (!/^property_[0-9a-f-]{36}$/.test(normalizedKey) || normalizedValues.length < 1 || normalizedValues.length > 10
      || normalizedValues.some((item) => item.length > 1000)) {
      throw new Error("Invalid Public Retail facet.");
    }
    return [normalizedKey, normalizedValues];
  }));
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeAvailability(value: string | undefined): PublicRetailAvailability | undefined {
  return PUBLIC_RETAIL_AVAILABILITY.find((candidate) => candidate === value);
}

function normalizeLocale(value: string | undefined): PublicRetailLocale {
  return PUBLIC_RETAIL_LOCALES.includes(value as PublicRetailLocale) ? value as PublicRetailLocale : "ru";
}

function normalizeSlug(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) || normalized.length > 160) {
    throw new Error("Invalid Public Retail slug.");
  }
  return normalized;
}

function optionalSlug(value: string | undefined): string | undefined {
  return value?.trim() ? normalizeSlug(value) : undefined;
}

function normalizeSearch(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  if (normalized.length > 100) throw new Error("Public Retail search is too long.");
  return normalized;
}

function integerInRange(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return Number.isInteger(value) && value! >= minimum && value! <= maximum ? value! : fallback;
}
