export const PUBLIC_RETAIL_LOCALES = ["ru", "ro"] as const;
export const PUBLIC_RETAIL_AVAILABILITY = [
  "in_stock", "low_stock", "available_to_order", "unavailable", "unknown",
] as const;

export type PublicRetailLocale = (typeof PUBLIC_RETAIL_LOCALES)[number];
export type PublicRetailAvailability = (typeof PUBLIC_RETAIL_AVAILABILITY)[number];
export type PublicRetailVatPresentation = "included" | "excluded" | "not_specified";

export type PublicRetailPriceDto = {
  amount: number;
  currency: string;
  vatPresentation: PublicRetailVatPresentation;
};

export type PublicRetailMediaDto = { url: string; alt: string };
export type PublicRetailSpecificationDto = { key: string; label: string; value: string };

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
};

export type PublicRetailProductPageDto = {
  items: PublicRetailProductSummaryDto[];
  totalCount: number;
  limit: number;
  offset: number;
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
