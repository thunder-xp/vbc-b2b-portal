export const BEHAVIOR_EVENT_NAMES = [
  "catalog_viewed",
  "category_viewed",
  "search_performed",
  "search_no_results",
  "filters_applied",
  "merchandising_section_viewed",
  "merchandising_product_clicked",
  "product_viewed",
  "product_document_downloaded",
  "stock_state_viewed",
  "arrival_date_viewed",
  "product_added_to_favorites",
  "product_removed_from_favorites",
  "product_added_to_compare",
  "product_removed_from_compare",
  "product_added_to_cart",
  "product_removed_from_cart",
  "cart_quantity_changed",
  "product_added_to_estimate",
  "estimate_created",
  "proposal_generated",
  "order_submitted",
  "reorder_started",
  "reorder_submitted",
  "out_of_stock_product_viewed",
  "unavailable_product_added",
  "arrival_interest_viewed",
  "dashboard_viewed",
  "dashboard_action_clicked",
  "order_list_viewed",
  "order_opened",
  "shipment_viewed",
  "date_change_started",
  "finance_viewed",
  "company_users_viewed",
] as const;

export type BehaviorEventName = (typeof BEHAVIOR_EVENT_NAMES)[number];
export type SafeBehaviorMetadata = Record<
  string,
  string | number | boolean | null
>;

export type RecordBehaviorEventInput = {
  eventName: BehaviorEventName;
  sessionId: string;
  productId?: string;
  categoryId?: string;
  brandId?: string;
  route: string;
  searchQuery?: string;
  resultCount?: number;
  quantity?: number;
  sourceSurface?: string;
  metadataSafe?: SafeBehaviorMetadata;
};

export type BehaviorAnalyticsPreview = {
  periodDays: number;
  eventCount: number;
  sufficientVolume: boolean;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    views: number;
    cart_adds: number;
    estimate_adds: number;
    no_stock_views: number;
    company_count: number;
  }>;
  searchGaps: Array<{
    query: string;
    searches: number;
    company_count: number;
  }>;
  categories: Array<{
    id: string;
    name: string;
    views: number;
    company_count: number;
  }>;
  merchandising: Array<{
    surface: string | null;
    views: number;
    clicks: number;
  }>;
};
