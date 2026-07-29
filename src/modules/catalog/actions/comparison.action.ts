"use server";

import {
  failureFromError,
  type ActionResult,
  success,
} from "../../access-control/actions/action-result";
import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { createMerchandisingService } from "../../merchandising/actions";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import type {
  ProductCommercialInternalDto,
  ProductCommercialViewDto,
} from "../../pricing-inventory/services";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import {
  buildCatalogComparisonMatrix,
  type CatalogComparisonMatrixRow,
} from "../services/catalog-comparison";
import {
  DefaultCatalogService,
  type CatalogProductCardDto,
} from "../services";

export type CatalogComparisonWarning =
  | "COMPARISON_PRODUCT_UNAVAILABLE"
  | "COMPARISON_ENRICHMENT_FAILED";

export type CatalogComparisonDto = {
  products: CatalogProductCardDto[];
  commercialViews: ProductCommercialViewDto[];
  matrix: CatalogComparisonMatrixRow[];
  excludedProductCount: number;
  warnings: CatalogComparisonWarning[];
  mixedCategories: boolean;
};

const COMPARISON_LIMIT = 4;

export async function getCatalogComparisonAction(
  productIds: string[],
): Promise<ActionResult<CatalogComparisonDto>> {
  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (
    !ids.length
    || ids.length > COMPARISON_LIMIT
    || ids.some((id) => !isPortalUuid(id))
  ) {
    return comparisonFailure(
      "COMPARISON_SCOPE_INVALID",
      `Можно сравнить от 1 до ${COMPARISON_LIMIT} товаров.`,
    );
  }

  const correlationId = crypto.randomUUID();
  try {
    const userId = await getAuthenticatedUserId();
    const access = createCompanyAccessService();
    const catalog = new DefaultCatalogService(
      new SupabaseCatalogRepository(),
      access,
    );
    const products = await catalog.getComparisonProductsByIds(userId, ids);
    const visibleIds = products.map((product) => product.id);
    const warnings: CatalogComparisonWarning[] = [];

    if (products.length !== ids.length) {
      warnings.push("COMPARISON_PRODUCT_UNAVAILABLE");
      console.warn({
        event: "comparison_products_excluded",
        correlationId,
        requestedCount: ids.length,
        visibleCount: products.length,
      });
    }

    const [commercialResult, merchandisingResult] = await Promise.allSettled([
      visibleIds.length
        ? createPricingInventoryService().getProductCommercialViews(userId, visibleIds)
        : Promise.resolve([]),
      visibleIds.length
        ? createMerchandisingService().listPublishedForProducts(userId, visibleIds)
        : Promise.resolve([]),
    ]);
    let commercialViews: ProductCommercialViewDto[] = [];
    if (commercialResult.status === "fulfilled") {
      commercialViews = commercialResult.value.map(toPublicCommercialView);
    } else {
      warnings.push("COMPARISON_ENRICHMENT_FAILED");
      logEnrichmentWarning(correlationId, "commercial");
    }

    const labelsByProduct = new Map<string, MerchandisingLabelCode[]>();
    if (merchandisingResult.status === "fulfilled") {
      for (const assignment of merchandisingResult.value) {
        const labels = labelsByProduct.get(assignment.productId) ?? [];
        labels.push(assignment.labelCode);
        labelsByProduct.set(assignment.productId, labels);
      }
    } else {
      warnings.push("COMPARISON_ENRICHMENT_FAILED");
      logEnrichmentWarning(correlationId, "merchandising");
    }

    const enrichedProducts = products.map((product) => ({
      ...product,
      merchandisingLabels: [...new Set(labelsByProduct.get(product.id) ?? [])],
    }));
    const categoryIds = new Set(
      enrichedProducts.map((product) => product.category?.id).filter(Boolean),
    );

    return success("Сравнение загружено.", {
      products: enrichedProducts,
      commercialViews,
      matrix: buildCatalogComparisonMatrix(enrichedProducts),
      excludedProductCount: ids.length - products.length,
      warnings: [...new Set(warnings)],
      mixedCategories: categoryIds.size > 1,
    });
  } catch (error) {
    const knownFailure = failureFromError(error);
    if (knownFailure.errorCode !== "SYSTEM_ERROR") return knownFailure;

    console.error({
      event: "comparison_read_failed",
      correlationId,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return comparisonFailure(
      "COMPARISON_READ_FAILED",
      `Не удалось загрузить сравнение. Повторите попытку. Код: ${correlationId}.`,
    );
  }
}

function toPublicCommercialView(
  view: ProductCommercialInternalDto,
): ProductCommercialViewDto {
  const { retailBelowPartnerPrice: internalDiagnostic, ...publicView } = view;
  void internalDiagnostic;
  return publicView;
}

function logEnrichmentWarning(
  correlationId: string,
  enrichment: "commercial" | "merchandising",
): void {
  console.warn({
    event: "comparison_enrichment_warning",
    correlationId,
    enrichment,
  });
}

function comparisonFailure(
  errorCode: string,
  message: string,
): ActionResult<never> {
  return { success: false, errorCode, message, data: null };
}

function isPortalUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
