"use server";

import {
  type ActionResult,
  failureFromError,
  success,
} from "../../access-control/actions/action-result";
import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import type {
  CatalogProductListInput,
  CatalogProductListResult,
} from "../services";
import { DefaultCatalogService } from "../services";

export async function listCatalogProductsAction(
  input: CatalogProductListInput,
): Promise<ActionResult<CatalogProductListResult>> {
  try {
    const userId = await getAuthenticatedUserId();
    const availability = normalizeAvailability(input.availability);
    const pricingInventoryService = createPricingInventoryService();
    const availabilityProductIds = availability === "all"
      ? undefined
      : await pricingInventoryService.getProductIdsByAvailability?.(userId, availability) ?? [];
    const products = await createCatalogService().listProducts(userId, {
      categoryId: normalizeOptionalText(input.categoryId),
      brandId: normalizeOptionalText(input.brandId),
      search: normalizeOptionalText(input.search),
      page: input.page,
      pageSize: input.pageSize,
      sort: input.sort,
      attributeFilters: normalizeFilters(input.attributeFilters),
      availabilityProductIds,
    });

    return success("Catalog products loaded.", products);
  } catch (error) {
    return failureFromError(error);
  }
}
function normalizeAvailability(value: CatalogProductListInput["availability"]): "all" | "in_stock" | "expected" {
  return value === "in_stock" || value === "expected" ? value : "all";
}
function normalizeFilters(filters: Record<string, string[]> | undefined): Record<string, string[]> | undefined { if (!filters) return undefined; return Object.fromEntries(Object.entries(filters).map(([key, values]) => [key.trim(), values.map((value) => value.trim()).filter(Boolean)])); }

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function createCatalogService(): DefaultCatalogService {
  return new DefaultCatalogService(
    new SupabaseCatalogRepository(),
    createCompanyAccessService(),
  );
}
