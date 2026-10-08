"use server";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { createPricingInventoryService } from "../../pricing-inventory/actions/service-factory";
import { SupabasePartnerOfferFeedRepository } from "../repositories/partner-offer-feed.repository";
import { PartnerOfferFeedService } from "../services/partner-offer-feed.service";
import type { OfferFeedInput, PartnerOfferFeedPage } from "../offer-feed";
import type { CampaignActionResult } from "./result";
import { campaignSuccess, campaignFailure } from "./result";
export async function listPartnerOfferFeedAction(
  input: OfferFeedInput = {},
): Promise<CampaignActionResult<PartnerOfferFeedPage>> {
  try {
    const service = new PartnerOfferFeedService(
      new SupabasePartnerOfferFeedRepository(),
      createPartnerWorkspaceContextService(),
      createPricingInventoryService(),
    );
    return campaignSuccess(
      await service.list(await getAuthenticatedUserId(), input),
      "Предложения загружены.",
    );
  } catch {
    return campaignFailure(
      "Не удалось загрузить предложения. Обновите страницу позже.",
      crypto.randomUUID(),
    );
  }
}
