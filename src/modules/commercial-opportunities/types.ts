export const OPPORTUNITY_TYPES = [
  "repeat_purchase_available",
  "watched_product_back_in_stock",
  "relevant_product_arrival_confirmed",
  "relevant_product_price_decreased",
  "purchase_template_ready",
  "previous_order_repeatable",
  "relevant_merchandising_offer",
  "relevant_product_low_stock",
  "source_product_low_stock_with_available_analog",
] as const;

export type CommercialOpportunityType = (typeof OPPORTUNITY_TYPES)[number];
export type CommercialOpportunityFilter = "all" | "available" | "arrivals" | "price" | "templates" | "offers";

export type OpportunityMoney = { amount: number; currency: string };
export type OpportunityProduct = {
  reference?: import("../catalog/types").ProductReferenceDto;
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  thumbnailFit?: "contain" | "cover";
  categoryName: string | null;
  partnerPrice: OpportunityMoney | null;
  retailPrice: OpportunityMoney | null;
  availableQuantity: number | null;
  expectedArrivalDate: string | null;
  expectedArrivalQuantity: number | null;
  alreadyInCart?: boolean;
};

export type CommercialOpportunity = {
  id: string;
  type: CommercialOpportunityType;
  priority: number;
  reasonCode: string;
  reasonMetadata: Record<string, unknown>;
  secondaryReasons: string[];
  fingerprint: string;
  firstDetectedAt: string;
  lastConfirmedAt: string;
  sourceType: string;
  sourceId: string;
  product: OpportunityProduct | null;
  template: { id: string; name: string } | null;
};

export type CommercialOpportunityPage = {
  items: CommercialOpportunity[];
  totalCount: number;
};
