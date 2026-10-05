export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";
export type CampaignFilter = "active" | "ending" | "stock" | "arrivals" | "purchased";
export type CampaignType = "product_offer" | "stock_clearance" | "arrival_promotion" | "reorder_campaign" | "category_campaign" | "partner_segment_offer";
export type CampaignMechanicType = "legacy_promo" | "quantity_threshold_promo" | "fixed_bundle_promo" | "conditional_attach_promo" | "spend_threshold_promo";
/** Decimal strings preserve the monetary contract across JSON and editor boundaries. */
export type SpendThresholdPromoConfig = { thresholdAmountUsd: string; currency: "USD"; qualifyingProductIds: string[]; rewardProductId: string };
export type CampaignSpendState = {
  campaignId: string; publicationVersion: number; eligible: boolean; conditionsReady: boolean;
  thresholdAmountUsd: string; qualifyingSpendUsd: string; remainingSpendUsd: string;
  thresholdReached: boolean; rewardPresent: boolean; rewardStockReady: boolean; reason: string;
  qualifyingProducts: Array<{ campaignItemId: string; productId: string; sku: string; name: string; currentQuantity: number }>;
  reward: CampaignAttachState["reward"];
};
export type CampaignPromoEligibilityReason = "eligible" | "below_threshold" | "invalid_threshold" | "missing_promo" | "inactive_campaign" | "outside_period" | "outside_audience" | "product_not_in_scope" | "legacy_campaign" | "trigger_normal_price" | "incomplete_triggers" | "reward_absent" | "qualifying_normal_price" | "missing_base_usd" | "base_price_access_denied" | "invalid_publication";

export type CampaignBundleComponent = {
  campaignItemId: string; productId: string; sku: string; name: string;
  requiredBundleQuantity: number; currentQuantity: number; missingQuantity: number;
  availableQuantity: number | null;
};
export type CampaignBundleState = {
  campaignId: string; publicationVersion: number; eligible: boolean;
  conditionsReady: boolean; stockReady: boolean; reason: string; components: CampaignBundleComponent[];
};
export type CampaignAttachState = {
  campaignId: string; publicationVersion: number; eligible: boolean; conditionsReady: boolean;
  triggersSatisfied: boolean; rewardPresent: boolean; triggerStockReady: boolean; rewardStockReady: boolean;
  reason: string; triggers: Array<Omit<CampaignBundleComponent, "requiredBundleQuantity"> & { requiredTriggerQuantity: number }>;
  reward: { campaignItemId: string; productId: string; sku: string; name: string; minimumQuantity: number;
    currentQuantity: number; availableQuantity: number | null } | null;
};
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
  mechanicType: CampaignMechanicType;
  promoThresholdQuantity: number | null;
  requiredBundleQuantity?: number | null;
  attachRole?: "TRIGGER" | "REWARD" | null;
  spendRole?: "QUALIFYING_SPEND" | "REWARD" | null;
  requiredTriggerQuantity?: number | null;
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
  publicationVersion: number;
  code: string;
  title: string;
  description: string;
  type: CampaignType;
  startsAt: string;
  endsAt: string;
  priority: number;
  imageAssetPath: string | null;
  termsSummary: string;
  mechanicType: CampaignMechanicType;
  products: CampaignProduct[];
  bundleProgress?: CampaignBundleState | null;
  attachProgress?: CampaignAttachState | null;
  spendProgress?: CampaignSpendState | null;
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
  promoPrice: CampaignMoney | null;
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
  spendConfig?: SpendThresholdPromoConfig | null;
  contractVersion: "3";
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
  mechanicType: CampaignMechanicType;
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
    promoThresholdQuantity: number | null;
    requiredBundleQuantity?: number | null;
    attachRole?: "TRIGGER" | "REWARD" | null;
    requiredTriggerQuantity?: number | null;
  }>;
};
export type CampaignDraftUpdateInput = CampaignDraftInput & {
  campaignId: string;
  expectedRevision: number;
};
export type CampaignDraftSeed = {
  spendConfig?: SpendThresholdPromoConfig | null;
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
    mechanicType: CampaignMechanicType;
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
