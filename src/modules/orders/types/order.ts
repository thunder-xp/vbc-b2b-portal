export enum CartStatus {
  Active = "active",
  Submitting = "submitting",
  Converted = "converted",
  Abandoned = "abandoned",
}

export enum PartnerOrderStatus {
  Processing = "processing",
  Submitted = "submitted",
  Failed = "failed",
  Unknown = "unknown",
}

export type Cart = {
  id: string;
  companyId: string;
  createdBy: string;
  status: CartStatus;
  createdAt: string;
  updatedAt: string;
};

export type CartItem = {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
};

export type PartnerOrder = {
  id: string;
  companyId: string;
  submittedBy: string;
  cartId: string | null;
  submissionKey: string;
  submissionAttemptId: string;
  status: PartnerOrderStatus;
  requestedDeliveryDate: string;
  external1cRef: string | null;
  external1cNumber: string | null;
  external1cDate: string | null;
  payloadSnapshot: Record<string, unknown>;
  safeErrorCode: string | null;
  safeErrorMessage: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerOrderItem = {
  id: string;
  orderId: string;
  productId: string;
  externalProductRef: string;
  productName: string;
  sku: string;
  quantity: number;
  partnerUnitPrice: number;
  currencyCode: string;
  lineTotal: number;
  availableStock: number | null;
  nearestArrivalDate: string | null;
  nearestArrivalQuantity: number | null;
  snapshotAt: string;
};
