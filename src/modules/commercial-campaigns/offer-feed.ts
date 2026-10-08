import type {
  CampaignFilter,
  CampaignMechanicType,
  CampaignProduct,
  PartnerCampaign,
} from "./types";
export type OfferFeedMechanicFilter =
  | "all"
  | "promo"
  | "quantity"
  | "bundle"
  | "conditional"
  | "spend";
export type OfferFeedInput = {
  filter?: CampaignFilter;
  mechanic?: OfferFeedMechanicFilter;
  search?: string;
  categoryId?: string;
  brandId?: string;
  sort?: "recommended" | "ending";
  page?: number;
  pageSize?: number;
};
type FeedContext = {
  offerId: string;
  campaignId: string;
  publicationVersion: number;
  campaignCode: string;
  campaignTitle: string;
  mechanicType: CampaignMechanicType;
  startsAt: string;
  endsAt: string;
  remainingSeconds: number;
  campaign: PartnerCampaign;
};
export type PartnerOfferFeedItem =
  | (FeedContext & {
      kind: "PRODUCT";
      product: CampaignProduct;
      directCart: boolean;
    })
  | (FeedContext & {
      kind: "BUNDLE";
      components: CampaignProduct[];
      progress: PartnerCampaign["bundleProgress"];
      summary: PartnerCampaign["commercialSummary"];
    })
  | (FeedContext & {
      kind: "CONDITIONAL";
      progress: PartnerCampaign["attachProgress"];
    })
  | (FeedContext & {
      kind: "SPEND_THRESHOLD";
      progress: PartnerCampaign["spendProgress"];
    });
export type OfferFeedKind = PartnerOfferFeedItem["kind"];
export type OfferFeedReadPage = {
  items: Array<{
    offerId: string;
    kind: OfferFeedKind;
    campaign: PartnerCampaign;
  }>;
  totalCount: number;
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
};
export type PartnerOfferFeedPage = Omit<OfferFeedReadPage, "items"> & {
  items: PartnerOfferFeedItem[];
  page: number;
  totalPages: number;
};
export const OFFER_FEED_KINDS: Record<CampaignMechanicType, OfferFeedKind> = {
  legacy_promo: "PRODUCT",
  quantity_threshold_promo: "PRODUCT",
  fixed_bundle_promo: "BUNDLE",
  bundle_special_price: "BUNDLE",
  conditional_attach_promo: "CONDITIONAL",
  spend_threshold_promo: "SPEND_THRESHOLD",
};
