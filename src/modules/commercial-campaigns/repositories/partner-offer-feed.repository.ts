import { createClient } from "@/src/lib/supabase/server";
import { CommercialCampaignRepositoryError } from "./commercial-campaign.repository";
import { mapCampaign } from "./supabase-commercial-campaign.repository";
import {
  OFFER_FEED_KINDS,
  type OfferFeedInput,
  type OfferFeedReadPage,
} from "../offer-feed";
export interface PartnerOfferFeedRepository {
  list(
    input: OfferFeedInput & {
      companyId: string;
      limit: number;
      offset: number;
    },
  ): Promise<OfferFeedReadPage>;
}
export class SupabasePartnerOfferFeedRepository
  implements PartnerOfferFeedRepository
{
  async list(
    input: Parameters<PartnerOfferFeedRepository["list"]>[0],
  ): Promise<OfferFeedReadPage> {
    const { data, error } = await (
      await createClient()
    ).rpc("list_partner_special_offer_feed_v1", {
      p_company_id: input.companyId,
      p_filter: input.filter ?? "active",
      p_mechanic: input.mechanic ?? "all",
      p_search: input.search ?? "",
      p_category_id: input.categoryId ?? null,
      p_brand_id: input.brandId ?? null,
      p_sort: input.sort ?? "recommended",
      p_limit: input.limit,
      p_offset: input.offset,
    });
    if (error || !data || typeof data !== "object")
      throw new CommercialCampaignRepositoryError(error?.code ?? null);
    const row = data as Record<string, unknown>;
    const facets = (value: unknown): Array<{ id: string; name: string }> =>
      Array.isArray(value)
        ? value.flatMap((v) =>
            v && typeof v.id === "string" && typeof v.name === "string"
              ? [{ id: v.id, name: v.name }]
              : [],
          )
        : [];
    return {
      items: Array.isArray(row.items)
        ? row.items.flatMap((v) => {
            const campaign = mapCampaign(v?.campaign)[0];
            return campaign &&
              typeof v.offerId === "string" &&
              v.kind === OFFER_FEED_KINDS[campaign.mechanicType]
              ? [{ offerId: v.offerId, kind: v.kind, campaign }]
              : [];
          })
        : [],
      totalCount: Number(row.totalCount) || 0,
      categories: facets(row.categories),
      brands: facets(row.brands),
    };
  }
}
