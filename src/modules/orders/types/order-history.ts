export type PartnerOrderHistoryStateCode = "open" | "preorder" | "test" | "completed";
export type PartnerOrderOrigin = "partner_platform" | "legacy_b2b" | "internal_1c" | "unknown_1c_source";
export type PartnerOrderHistorySyncMode = "full" | "incremental";

export type PartnerOrderHistory = {
  id: string;
  companyId: string;
  portalOrderId: string | null;
  external1cOrderRef: string;
  external1cOrderNumber: string;
  oneCPosted: boolean;
  oneCDeletionMark: boolean;
  oneCStateRef: string | null;
  oneCStateRaw: string | null;
  oneCStateCode: PartnerOrderHistoryStateCode | null;
  oneCDocumentDate: string;
  oneCDeliveryDate: string | null;
  oneCSourceVersion: string | null;
  oneCLastSyncedAt: string;
  externalContractRef: string | null;
  externalCurrencyRef: string | null;
  documentTotal: number;
  currencyCode: string | null;
  originType: PartnerOrderOrigin;
  partnerVisible: boolean;
  hiddenReason: string | null;
  positionCount: number;
  totalUnitCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PartnerOrderHistoryItem = {
  id: string;
  orderHistoryId: string;
  lineNumber: number;
  productId: string | null;
  externalProductRef: string;
  externalCharacteristicRef: string | null;
  productName: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  currencyCode: string | null;
};

export type PartnerOrderHistoryEvent = {
  id: string;
  orderHistoryId: string;
  eventType: "imported" | "received_by_one_c" | "posted" | "became_unposted" | "state_changed" | "delivery_date_changed" | "sync_restored" | "date_change_requested" | "date_change_approved" | "date_change_rejected" | "date_change_cancelled" | "date_change_reflected";
  occurredAt: string;
  previousValue: string | null;
  currentValue: string | null;
};

export type PartnerOrderHistorySyncState = {
  companyId: string;
  counterpartyRef: string;
  status: "idle" | "running" | "succeeded" | "failed";
  syncMode: PartnerOrderHistorySyncMode | null;
  activeSyncId: string | null;
  lastSuccessfulFullSyncAt: string | null;
  lastIncrementalSyncAt: string | null;
  lastSourceVersion: string | null;
  safeError: string | null;
  recordsReceived: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsHidden: number;
  startedAt: string | null;
  finishedAt: string | null;
};
