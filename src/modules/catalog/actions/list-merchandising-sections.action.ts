"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import {
  createCompanyAccessService,
  getAuthenticatedUser,
} from "../../access-control/actions/service-factory";
import {
  createMerchandisingService,
} from "../../merchandising/actions";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import { createCommercialCampaignService } from "../../commercial-campaigns/actions/service-factory";
import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { resolveRollingPeriod, type EffectiveRollingPeriod } from "../../commerce-period";
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
  totalCount: number;
  offerRemainingSeconds?: Record<string, number>;
};

export type CatalogMerchandisingSectionsResult = {
  sections: CatalogMerchandisingSection[];
  commercialViews: ProductCommercialViewDto[];
};

const SECTION_ORDER: Array<{
  labelCode: MerchandisingLabelCode;
  title: string;
  href?: string;
}> = [
  { labelCode: "TOP", title: "Популярное" },
  { labelCode: "NEW", title: "Новинки", href: "/cabinet/catalog?label=NEW" },
  { labelCode: "HOT", title: "Горячие предложения" },
];

export async function listCatalogMerchandisingSectionsAction(requestedPeriods: { popular: EffectiveRollingPeriod; new: EffectiveRollingPeriod; hot: EffectiveRollingPeriod } = { popular: 365, new: 365, hot: 365 }): Promise<
  ActionResult<CatalogMerchandisingSectionsResult>
> {
  try {
    const periods = { popular: resolveRollingPeriod(requestedPeriods.popular), new: resolveRollingPeriod(requestedPeriods.new), hot: resolveRollingPeriod(requestedPeriods.hot) };
    const user = await getAuthenticatedUser();
    const userId = user.id;
    const [assignments, context] = await Promise.all([
      createMerchandisingService().listPublished(
        userId,
        undefined,
        5,
        user.loginGeneration,
        periods.popular,
        periods.new,
        periods.hot,
      ),
      createPartnerWorkspaceContextService().getWorkspaceContext(userId),
    ]);
    const [replenishmentPage, specialOffers] = await Promise.all([
      context.accessState === "active" && context.companyId
      ? new SupabaseWarehouseArrivalRepository().getCurrentReplenishmentPreview(context.companyId)
      : { items: [], totalCount: 0 },
      context.accessState === "active" && context.capabilities.navigation.some((item) => item.key === "offers" && item.availability === "available")
        ? createCommercialCampaignService().getActiveProductPreview(userId, true)
        : { productIds: [] as string[], totalCount: 0, timeRemaining: {} as Record<string, number> },
    ]);
    const replenishment = replenishmentPage.items;
    const productIds = [...new Set([
      ...assignments.map((item) => item.productId),
      ...replenishment.map((item) => item.productId),
      ...specialOffers.productIds,
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
        merchandisingLabels: [...assignments
          .filter((assignment) => assignment.productId === product.id)
          .map((assignment) => assignment.labelCode),
          ...(specialOffers.productIds.includes(product.id) ? ["SPECIAL_OFFER" as const] : []),
        ],
      },
    ]));
    const sections: CatalogMerchandisingSection[] = SECTION_ORDER.flatMap(({ href, labelCode, title }) => {
      const sectionProducts = assignments
        .filter((assignment) => assignment.labelCode === labelCode)
        .flatMap((assignment) => {
          const product = productsById.get(assignment.productId);
          return product ? [product] : [];
        });
      return sectionProducts.length
        ? [{
          labelCode,
          title,
          products: sectionProducts,
          ...(href ? { href } : {}),
          totalCount: assignments.find((assignment) => assignment.labelCode === labelCode)?.matchingProductCount
            ?? sectionProducts.length,
          ...(labelCode === "TOP" ? { href: `/cabinet/catalog?label=TOP${periods.popular === 365 ? "" : `&period=${periods.popular}`}` } : {}),
          ...(labelCode === "NEW" ? { href: `/cabinet/catalog?label=NEW${periods.new === 365 ? "" : `&period=${periods.new}`}` } : {}),
          ...(labelCode === "HOT" ? { href: `/cabinet/catalog?label=HOT${periods.hot === 365 ? "" : `&period=${periods.hot}`}` } : {}),
        }]
        : [];
    });
    const specialOfferProducts = specialOffers.productIds.flatMap((id) => {
      const product = productsById.get(id);
      return product ? [product] : [];
    });
    if (specialOfferProducts.length) {
      sections.push({
        labelCode: "SPECIAL_OFFER",
        title: "Спецпредложения",
        products: specialOfferProducts,
        href: "/cabinet/offers",
        totalCount: specialOffers.totalCount,
        offerRemainingSeconds: specialOffers.timeRemaining,
      });
    }
    const replenishmentProducts = replenishment
      .flatMap((item) => {
        const product = productsById.get(item.productId);
        return product ? [product] : [];
      });
    if (replenishmentProducts.length) {
      sections.push({
        labelCode: "REPLENISHMENT",
        title: "Поступление",
        products: replenishmentProducts,
        href: "/cabinet/catalog?collection=replenishment",
        contextBadge: "Поступление",
        totalCount: replenishmentPage.totalCount,
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
