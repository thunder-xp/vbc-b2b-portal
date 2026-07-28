export type MerchandisingLabelCode = "NEW" | "TOP" | "HOT";
export type MerchandisingSource =
  | "manual"
  | "one_c"
  | "analytics_recommendation";
export type MerchandisingOperation = "assign" | "revoke" | "hide" | "show";

export type PublishedMerchandisingAssignment = {
  productId: string;
  labelCode: MerchandisingLabelCode;
  priority: number;
  startsAt: string;
  endsAt: string | null;
  source: Exclude<MerchandisingSource, "analytics_recommendation">;
};

export type AdminMerchandisingAssignment = {
  id: string;
  labelCode: MerchandisingLabelCode;
  startsAt: string;
  endsAt: string | null;
  priority: number;
  isActive: boolean;
  isCuratedVisible: boolean;
  source: MerchandisingSource;
  updatedAt: string;
  updatedBy: string | null;
};

export type AdminMerchandisingProduct = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  brandName: string | null;
  categoryName: string | null;
  isPublished: boolean;
  hasPartnerPrice: boolean;
  hasRetailPrice: boolean;
  stockState: "in_stock" | "expected" | "unavailable";
  hasExpectedArrival: boolean;
  assignments: AdminMerchandisingAssignment[];
};

export type AdminMerchandisingPage = {
  items: AdminMerchandisingProduct[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type ManageMerchandisingInput = {
  operation: MerchandisingOperation;
  productIds: string[];
  labelCode: MerchandisingLabelCode;
  startsAt?: string | null;
  endsAt?: string | null;
  priority?: number;
  reason: string;
};
