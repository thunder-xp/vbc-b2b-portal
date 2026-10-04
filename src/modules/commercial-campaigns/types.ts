export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";
export type CampaignFilter = "active" | "ending" | "stock" | "arrivals" | "purchased";
export type CampaignType = "product_offer" | "stock_clearance" | "arrival_promotion" | "reorder_campaign" | "category_campaign" | "partner_segment_offer";

export type CampaignMoney = { amount: number; currency: string };
export type CampaignProduct = {
  itemId: string;
  productId: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  minimumQuantity: number;
  maximumQuantityPerCompany: number | null;
  partnerMessage: string | null;
  msrpPrice: CampaignMoney | null;
  partnerPrice: CampaignMoney | null;
  specialPrice: CampaignMoney | null;
  /** Compatibility price used by the existing cart presentation path. */
  price: CampaignMoney | null;
  availableQuantity: number | null;
  expectedArrivalDate: string | null;
};

export type PartnerCampaign = {
  id: string;
  code: string;
  title: string;
  description: string;
  type: CampaignType;
  startsAt: string;
  endsAt: string;
  priority: number;
  imageAssetPath: string | null;
  termsSummary: string;
  products: CampaignProduct[];
};

export type PartnerCampaignPage = { items: PartnerCampaign[]; totalCount: number };
export type AdminCampaignSummary = {
  id: string;
  code: string;
  name: string;
  partnerTitle: string;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  priority: number;
  itemCount: number;
  audienceCount: number;
  createdAt: string;
  updatedAt: string;
};
export type AdminCampaignPage = { items: AdminCampaignSummary[]; totalCount: number };
export type AdminCampaignFilter = {
  status?: CampaignStatus | "all";
  search?: string;
  campaignType?: CampaignType | "all";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};
export type CampaignProductOption = {
  id: string;
  sku: string;
  model: string | null;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  availableQuantity: number | null;
  currentPrice: CampaignMoney | null;
};
export type CampaignProductSearch = {
  items: CampaignProductOption[];
  totalCount: number;
  page: number;
  totalPages: number;
};
export type CampaignCompanyOption = { id: string; name: string; status: string };
export type CampaignCompanySearch = { items: CampaignCompanyOption[]; totalCount: number };
export type CampaignPriceProfile = { reference: string; code: string | null; name: string; currency: string | null };
export type CampaignAssetOption = { path: string; label: string };
export type CampaignBuilderOptions = {
  products: CampaignProductOption[];
  productTotalCount: number;
  categories: Array<{ id: string; parentId: string | null; name: string }>;
  brands: Array<{ id: string; name: string }>;
  companies: CampaignCompanyOption[];
  priceProfiles: CampaignPriceProfile[];
  assets: CampaignAssetOption[];
};
export type CampaignDraftInput = {
  contractVersion: "2";
  requestId: string;
  code: string;
  name: string;
  partnerTitle: string;
  partnerDescription: string;
  internalNote?: string;
  campaignType: CampaignType;
  startsAt: string;
  endsAt: string;
  priority: number;
  imageAssetPath?: string;
  termsSummary: string;
  audienceMode: "explicit_company" | "all_active_partners" | "commercial_mode_full" | "commercial_mode_retail_only" | "momentum_slowing" | "momentum_attention";
  companyIds: string[];
  items: Array<{
    productId: string;
    sortOrder: number;
    minimumQuantity: number;
    maximumQuantityPerCompany: number | null;
    benefitType: "informational_only" | "existing_price_profile";
    governedBenefitReference: string | null;
    partnerMessage: string | null;
  }>;
};
export type CampaignDraftUpdateInput = CampaignDraftInput & {
  campaignId: string;
  expectedRevision: number;
};
export type CampaignDraftSeed = {
  campaignId: string;
  revision: number;
  values: {
    code: string;
    name: string;
    title: string;
    description: string;
    internalNote: string;
    terms: string;
    type: CampaignType;
    startsAt: string;
    endsAt: string;
    priority: number;
    image: string;
  };
  audienceMode: CampaignDraftInput["audienceMode"];
  companyIds: string[];
  items: Array<CampaignDraftInput["items"][number] & { product: CampaignProductOption }>;
};
export type AdminCampaignDetail = {
  campaign: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  rules: Array<Record<string, unknown>>;
  audience: Array<Record<string, unknown>>;
  analytics: { impressions: number; opens: number; carts: number; orders: number; attributedQuantity: number };
};
