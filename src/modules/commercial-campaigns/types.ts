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
};
export type AdminCampaignPage = { items: AdminCampaignSummary[]; totalCount: number };
export type CampaignBuilderOptions = {
  initialProductPage: CampaignBuilderProductPage;
  categories: Array<{ id: string; parentId: string | null; name: string }>;
  brands: Array<{ id: string; name: string }>;
  companies: Array<{ id: string; name: string; status: string }>;
};
export type CampaignBuilderProduct = {
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
export type CampaignBuilderProductPage = {
  items: CampaignBuilderProduct[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
};
export type CampaignProductSearchInput = {
  search?: string;
  categoryId?: string;
  brandId?: string;
  inStockOnly?: boolean;
  page?: number;
  pageSize?: number;
};
export type CampaignDraftInput = {
  contractVersion: 1;
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
export type CampaignDraftFailureDiagnostic = {
  correlationId: string;
  stage: "create_draft_rpc";
  safeErrorCode: string;
  serverRpcCode: string | null;
  hasDraftData: boolean;
  itemCount: number;
  hasAudience: boolean;
};
export type AdminCampaignDetail = {
  campaign: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  rules: Array<Record<string, unknown>>;
  audience: Array<Record<string, unknown>>;
  analytics: { impressions: number; opens: number; carts: number; orders: number; attributedQuantity: number };
};
