export const PUBLIC_RETAIL_LOCALES = ["ru", "ro"] as const;
export const PUBLIC_RETAIL_AVAILABILITY = [
  "in_stock", "low_stock", "available_to_order", "unavailable", "unknown",
] as const;

export type PublicRetailLocale = (typeof PUBLIC_RETAIL_LOCALES)[number];
export type PublicRetailAvailability = (typeof PUBLIC_RETAIL_AVAILABILITY)[number];
export type PublicRetailVatPresentation = "included" | "excluded" | "not_specified";
export type PublicRetailMerchandisingMode = "popular" | "new" | "hot" | "special" | "replenishment";
export type PublicRetailPriceSort = "price_asc" | "price_desc";
export type PublicRetailCatalogMode = PublicRetailMerchandisingMode | PublicRetailPriceSort;

export type PublicRetailPriceDto = {
  amount: number;
  currency: string;
  vatPresentation: PublicRetailVatPresentation;
};

export type PublicRetailMediaDto = { url: string; alt: string };
export type PublicPartnerDirectoryEntryDto = { displayName: string; logoUrl: string | null };
export type PublicRetailSpecificationDto = { key: string; label: string; value: string; filterable: boolean };
export type PublicRetailDocumentDto = { type: "datasheet"; url: string };

export type PublicRetailCategoryDto = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  productCount: number;
};

export type PublicRetailProductSummaryDto = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription: string | null;
  image: PublicRetailMediaDto | null;
  brand: { slug: string; name: string } | null;
  category: { slug: string; name: string } | null;
  price: PublicRetailPriceDto;
  availability: PublicRetailAvailability;
  highlights: PublicRetailSpecificationDto[];
  calculatorEligible: boolean;
};

export type PublicRetailProductDetailDto = PublicRetailProductSummaryDto & {
  description: string | null;
  categoryPath: Array<{ id: string; slug: string; name: string }>;
  gallery: PublicRetailMediaDto[];
  specifications: PublicRetailSpecificationDto[];
  datasheet: PublicRetailDocumentDto | null;
};

export type PublicRetailProductPageDto = {
  items: PublicRetailProductSummaryDto[];
  totalCount: number;
  limit: number;
  offset: number;
};

export type PublicRetailShowcaseDto = {
  popular: PublicRetailProductSummaryDto[];
  new: PublicRetailProductSummaryDto[];
  hot: PublicRetailProductSummaryDto[];
  replenishment: PublicRetailProductSummaryDto[];
};

export type PublicRetailCalculatorProductResolutionDto = {
  profileKey: string;
  matchCount: number;
  product: PublicRetailProductSummaryDto | null;
};

export type PublicRetailFacetDto = {
  key: string;
  label: string;
  values: Array<{ value: string; count: number }>;
  coverage: number;
};

export type PublicRetailPublicationMetrics = {
  publicationId: string;
  sourceProducts: number;
  eligibleProducts: number;
  excludedProducts: number;
  missingRetail: number;
  missingImage: number;
  missingCategory: number;
  productsWithStructuredSpecifications: number;
  checksum: string;
};

export type PublicRetailCartSource = "catalog" | "product_detail" | "cctv_calculator";
export type PublicRetailCartItemDto = {
  publicProductId: string;
  bundleId: string | null;
  source: PublicRetailCartSource;
  commercialGroup: "equipment" | "materials";
  slug: string | null;
  sku: string;
  name: string;
  image: PublicRetailMediaDto | null;
  quantity: number;
  unitCode: "piece" | "meter" | "service";
  price: PublicRetailPriceDto | null;
  availability: PublicRetailAvailability;
  lineAmount: number | null;
  stale: boolean;
  priceChanged: boolean;
};
export type PublicRetailCartBundleDto = {
  id: string;
  source: "cctv_calculator";
  installationIntent: { cameraInstallation: boolean; cableLaying: boolean; commissioning: boolean; remoteViewing: boolean; aiScenarioProgramming?: boolean } | null;
  calculatorVersion?: string;
  calculatorInput?: Record<string, unknown> | null;
  workScope?: Array<{ kind: string; quantity: number; unitCode: "piece" | "meter" | "service" }> | null;
  installationPricing?: {
    tariffSetId: string;
    tariffVersion: number;
    currency: string;
    vatTreatment: PublicRetailVatPresentation;
    lines: Array<{ serviceType: string; quantity: number; unitCode: "piece" | "meter" | "service"; unitPrice: number; amount: number }>;
    subtotal: number;
  } | null;
};
export type PublicRetailCartDto = {
  revision: number;
  distinctItemCount: number;
  totalQuantity: number;
  items: PublicRetailCartItemDto[];
  bundles: PublicRetailCartBundleDto[];
  totals: { equipment: number | null; materials: number | null; installation: number | null; total: number | null; currency: string | null };
};
export type PublicRetailCartMutationDto = { revision: number; distinctItemCount: number; totalQuantity: number; repeated: boolean; bundleId: string | null };

export type PublicRetailCommercialOfferDto = {
  id: string;
  type: "economy_immediate_payment_discount";
  status: "active" | "redeemed" | "expired" | "invalidated";
  policyVersion: "retail_equipment_conversion_offer_v1";
  discountPercent: 10;
  scope: "equipment";
  discountAmount: number;
  expiresAt: string;
  currency: string;
  resultingTotal: number;
  repeated: boolean;
};

export type PublicInstallationCheckoutOptionsDto = {
  regions: Array<{ code: string; name: string }>;
  providers: Array<{
    providerId: string;
    regionCode: string;
    displayName: string;
    description: string | null;
    logoUrl: string | null;
    availability: "available" | "limited";
  }>;
};

export type PublicRetailCheckoutLineDto = {
  publicProductId: string;
  bundleId: string | null;
  source: PublicRetailCartSource;
  commercialGroup: "equipment" | "materials";
  slug: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitCode: "piece" | "meter" | "service";
  unitPrice: number;
  lineTotal: number;
  currency: string;
  vatPresentation: PublicRetailVatPresentation;
  availability: PublicRetailAvailability;
  priceChanged: boolean;
  missing: boolean;
};
export type PublicRetailCheckoutDto = {
  cartRevision: number;
  publicationId: string;
  eligible: boolean;
  blockingReason: "empty_cart" | "unpublished_product" | "unavailable_product" | "currency_conflict" | null;
  priceChanged: boolean;
  fingerprint: string;
  selectedVariant: "recommended" | "economy" | null;
  installationRequired: boolean;
  installationOptions: PublicInstallationCheckoutOptionsDto | null;
  commercialOffer: PublicRetailCommercialOfferDto | null;
  lines: PublicRetailCheckoutLineDto[];
  bundles: PublicRetailCartBundleDto[];
  totals: { equipment: number; materials: number; installation: number; equipmentDiscount: number; total: number; currency: string; vatPresentation: PublicRetailVatPresentation | "mixed" };
};
export type RetailAddressDto = { locality: string; street: string; building: string; unit: string | null; postalCode: string | null; instructions: string | null };
export type PublicRetailOrderDto = {
  orderNumber: string;
  status: "awaiting_payment" | "confirmed";
  createdAt: string;
  locale: PublicRetailLocale;
  customer: { name: string; phone: string; email: string | null };
  deliveryAddress: RetailAddressDto;
  installationAddress: RetailAddressDto | null;
  installationIntent: Array<{ bundleId: string; intent: Record<string, boolean>; workScope: unknown[] | null }>;
  calculatorEvidence: Array<{ bundleId: string; source: "cctv_calculator"; calculatorVersion: string; calculatorInput: Record<string, unknown> | null }>;
  totals: PublicRetailCheckoutDto["totals"];
  lines: Array<Omit<PublicRetailCheckoutLineDto, "bundleId" | "priceChanged" | "missing"> & { lineNumber: number }>;
};
export type PublicRetailOrderCreatedDto = { orderNumber: string; status: "awaiting_payment" | "confirmed"; repeated: boolean; accessExpiresAt: string };
export type PublicRetailInstallationStatusDto = {
  status: "selecting_team" | "scheduling" | "scheduled" | "in_progress" | "completed_by_provider" | "customer_confirmation_pending" | "customer_confirmed" | "issue_reported" | "disputed" | "resolved" | "cancelled";
  label: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  revision: number | null;
  confirmationRequired: boolean;
  issueReportingAllowed: boolean;
  providerName: string | null;
};
