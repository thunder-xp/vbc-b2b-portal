export type WarrantyLookupResultCode =
  | "covered"
  | "expired"
  | "review_required"
  | "returned_or_cancelled"
  | "conflict"
  | "not_found";

export type PartnerWarrantyLookup = {
  verificationId: string;
  result: WarrantyLookupResultCode;
  warrantyState?: string;
  ownershipState?: string;
  productId?: string | null;
  sku?: string | null;
  productName?: string | null;
  saleDate?: string | null;
  warrantyMonths?: number | null;
  warrantyEndDate?: string | null;
  maskedSerial?: string | null;
  reviewReasonCodes?: string[];
  chronologyComplete?: boolean;
};

export type InternalWarrantyLookup = PartnerWarrantyLookup & {
  serial?: string;
  protectedSerial?: string;
  companyId?: string | null;
  companyName?: string | null;
  calculatedAt?: string;
  timeline?: Array<{
    eventType: string;
    documentNumber: string;
    documentDate: string;
    posted: boolean;
    deleted: boolean;
    mappingState: string;
    reviewReasonCodes: string[];
  }>;
};

export type WarrantySerialDiagnostics = {
  totalEvents: number;
  uniqueSerials: number;
  currentSales: number;
  covered: number;
  reviewRequired: number;
  expired: number;
  returned: number;
  cancelled: number;
  resold: number;
  conflicts: number;
  unmappedCompanies: number;
  unmappedProducts: number;
  missingWarrantyPeriod: number;
  sourceIncomplete: number;
  latestSaleDate: string | null;
  latestReturnDate: string | null;
  latestSync: Record<string, unknown> | null;
  reconciliationBacklog: number;
  workerFailures: number;
};

export type WarrantySourceDocument = {
  sourceEntity: string;
  sourceDocumentRef: string;
  sourceDocumentNumber: string;
  sourceDocumentDate: string;
  sourcePosted: boolean;
  sourceDeletionMark: boolean;
  sourceDataVersion: string | null;
  sourceFingerprint: string;
};

export type WarrantySourceEvent = {
  serial: string;
  eventType: "sale_observed" | "sale_unposted" | "sale_deleted" | "customer_return" | "stock_reentry" | "conflict_observed";
  sourceEntity: string;
  sourceDocumentRef: string;
  relatedSourceDocumentRef: string | null;
  sourceDocumentNumber: string;
  sourceDocumentDate: string;
  sourcePosted: boolean;
  sourceDeletionMark: boolean;
  sourceDataVersion: string | null;
  sourceLineNumber: number;
  sourceSerialLineNumber: number;
  sourceLinkKey: string;
  counterpartyRef: string | null;
  productRef: string | null;
  characteristicRef: string | null;
  organizationRef: string | null;
  warehouseRef: string | null;
  quantity: number;
  productSkuSnapshot: string | null;
  productNameSnapshot: string | null;
  warrantyMonthsSnapshot: number | null;
  mappingState: "mapped" | "conflict";
  reviewReasonCodes: string[];
};

export type WarrantySourcePage = {
  documents: WarrantySourceDocument[];
  events: WarrantySourceEvent[];
  headersReceived: number;
  pageComplete: boolean;
};
