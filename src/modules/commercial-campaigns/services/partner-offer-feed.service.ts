import type { PartnerWorkspaceContextService } from "../../partner-cabinet/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import { InvalidStateError } from "../../access-control/services";
import type { PartnerOfferFeedRepository } from "../repositories/partner-offer-feed.repository";
import type {
  OfferFeedInput,
  PartnerOfferFeedItem,
  PartnerOfferFeedPage,
} from "../offer-feed";
import {
  projectCampaignCommercial,
} from "./campaign-commercial-projection";
import {
  campaignTimeState,
  campaignRemainingSeconds,
} from "./campaign-lifecycle";
export class PartnerOfferFeedService {
  constructor(
    private readonly repository: PartnerOfferFeedRepository,
    private readonly workspace: PartnerWorkspaceContextService,
    private readonly pricing: PricingInventoryService,
  ) {}
  async list(
    userId: string,
    input: OfferFeedInput = {},
  ): Promise<PartnerOfferFeedPage> {
    const context = await this.workspace.getWorkspaceContext(userId);
    if (!context.companyId || context.accessState !== "active")
      throw new InvalidStateError("Partner workspace is unavailable.");
    const page = Number.isFinite(input.page)
      ? Math.max(1, Math.trunc(input.page!))
      : 1;
    const pageSize = Number.isFinite(input.pageSize)
      ? Math.min(50, Math.max(1, Math.trunc(input.pageSize!)))
      : 20;
    const result = await this.repository.list({
      ...input,
      search: input.search?.trim().slice(0, 100),
      companyId: context.companyId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const productIds = [
      ...new Set(
        result.items.flatMap((item) =>
          item.campaign.products
            .filter((p) => p.specialPrice)
            .map((p) => p.productId),
        ),
      ),
    ];
    const views = productIds.length
      ? await this.pricing.getProductCommercialViews(userId, productIds)
      : [];
    const now = new Date();
    const items: PartnerOfferFeedItem[] = result.items.map((item) => {
      const campaign = {
        ...projectCampaignCommercial(item.campaign, views),
        timeState: campaignTimeState(
          item.campaign.startsAt,
          item.campaign.endsAt,
          now,
        ),
        remainingSeconds: campaignRemainingSeconds(item.campaign.endsAt, now),
      };
      const base = {
        offerId: item.offerId,
        campaignId: campaign.id,
        publicationVersion: campaign.publicationVersion,
        campaignCode: campaign.code,
        campaignTitle: campaign.title,
        mechanicType: campaign.mechanicType,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        remainingSeconds: campaign.remainingSeconds,
        campaign,
      };
      switch (item.kind) {
        case "PRODUCT":
          return {
            ...base,
            kind: item.kind,
            product: campaign.products[0],
            directCart:
              campaign.timeState === "ACTIVE" &&
              Boolean(campaign.products[0]?.price),
          };
        case "BUNDLE":
          return {
            ...base,
            kind: item.kind,
            components: campaign.products,
            progress: campaign.bundleProgress,
            summary: campaign.commercialSummary,
            composition: { skuCount: campaign.products.length, totalUnits: campaign.products.reduce((total, product) => total + (product.requiredBundleQuantity ?? 0), 0) },
          };
        case "CONDITIONAL":
          return {
            ...base,
            kind: item.kind,
            progress: campaign.attachProgress,
          };
        case "SPEND_THRESHOLD":
          return { ...base, kind: item.kind, progress: campaign.spendProgress };
      }
    });
    return {
      ...result,
      items,
      page,
      totalPages: Math.max(1, Math.ceil(result.totalCount / pageSize)),
    };
  }
}
