"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import {
  createMerchandisingService,
} from "../../merchandising/actions";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { SupabaseWarehouseArrivalRepository } from "../../warehouse-arrivals/repositories";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import {
  DefaultCatalogService,
  type CatalogProductCardDto,
} from "../services";

export type CatalogMerchandisingSection = {
  labelCode: MerchandisingLabelCode | "REPLENISHMENT";
  title: string;
  products: CatalogProductCardDto[];
  href?: string;
  contextBadge?: string;
  maxProducts?: number;
};

export type CatalogMerchandisingSectionsResult = {
  sections: CatalogMerchandisingSection[];
  commercialViews: ProductCommercialViewDto[];
};

const SECTION_ORDER: Array<{
  labelCode: MerchandisingLabelCode;
  title: string;
}> = [
  { labelCode: "TOP", title: "Популярные товары" },
  { labelCode: "NEW", title: "Новинки" },
  { labelCode: "HOT", title: "Горячие предложения" },
];

export async function listCatalogMerchandisingSectionsAction(): Promise<
  ActionResult<CatalogMerchandisingSectionsResult>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const [assignments, context] = await Promise.all([
      createMerchandisingService().listPublished(userId, undefined, 10),
      createPartnerWorkspaceContextService().getWorkspaceContext(userId),
    ]);
    const replenishment = context.accessState === "active" && context.companyId
      ? await new SupabaseWarehouseArrivalRepository().getCurrentReplenishment(context.companyId)
      : [];
    const productIds = [...new Set([
      ...assignments.map((item) => item.productId),
      ...replenishment.map((item) => item.productId),
    ])];
    if (!productIds.length) {
      return success("Catalog merchandising is empty.", {
        sections: [],
        commercialViews: [],
      });
    }

    const pricingService = createPricingInventoryService();
    const catalogService = new DefaultCatalogService(
      new SupabaseCatalogRepository(),
      createCompanyAccessService(),
      pricingService,
    );
    const [products, commercialViews] = await Promise.all([
      catalogService.getProductsByIds(userId, productIds),
      pricingService.getProductCommercialViews(userId, productIds),
    ]);
    const productsById = new Map(products.map((product) => [
      product.id,
      {
        ...product,
        merchandisingLabels: assignments
          .filter((assignment) => assignment.productId === product.id)
          .map((assignment) => assignment.labelCode),
      },
    ]));
    const commercialByProduct = new Map(commercialViews.map((view) => [view.productId, view]));
    const sourceOrder = new Map(replenishment.map((item) => [item.productId, item.sourceLineNumber]));

    const sections: CatalogMerchandisingSection[] = SECTION_ORDER.flatMap(({ labelCode, title }) => {
      const sectionProducts = assignments
        .filter((assignment) => assignment.labelCode === labelCode)
        .flatMap((assignment) => {
          const product = productsById.get(assignment.productId);
          return product ? [product] : [];
        });
      return sectionProducts.length
        ? [{ labelCode, title, products: sectionProducts }]
        : [];
    });
    const replenishmentProducts = replenishment
      .flatMap((item) => {
        const product = productsById.get(item.productId);
        return product ? [product] : [];
      })
      .toSorted((left, right) => {
        const stockDifference = stockRank(commercialByProduct.get(left.id)) - stockRank(commercialByProduct.get(right.id));
        return stockDifference || (sourceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (sourceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id);
      });
    if (replenishmentProducts.length) {
      sections.push({
        labelCode: "REPLENISHMENT",
        title: "Пополнение",
        products: replenishmentProducts,
        href: "/cabinet/catalog/replenishment",
        contextBadge: "ПОПОЛНЕНИЕ",
        maxProducts: 5,
      });
    }

    return success("Catalog merchandising loaded.", {
      sections,
      commercialViews,
    });
  } catch (error) {
    return failureFromError(error);
  }
}

function stockRank(view: ProductCommercialViewDto | undefined): number {
  return view?.stock?.status === "in_stock" || view?.stock?.status === "low_stock" ? 0 : 1;
}
