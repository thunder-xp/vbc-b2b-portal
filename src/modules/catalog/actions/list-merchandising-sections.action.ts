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
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { SupabaseCatalogRepository } from "../repositories/supabase";
import {
  DefaultCatalogService,
  type CatalogProductCardDto,
} from "../services";

export type CatalogMerchandisingSection = {
  labelCode: MerchandisingLabelCode;
  title: string;
  products: CatalogProductCardDto[];
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
    const assignments = await createMerchandisingService().listPublished(
      userId,
      undefined,
      6,
    );
    const productIds = [...new Set(assignments.map((item) => item.productId))];
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

    const sections = SECTION_ORDER.flatMap(({ labelCode, title }) => {
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

    return success("Catalog merchandising loaded.", {
      sections,
      commercialViews,
    });
  } catch (error) {
    return failureFromError(error);
  }
}
