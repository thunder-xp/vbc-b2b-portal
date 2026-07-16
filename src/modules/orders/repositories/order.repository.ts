import type { Cart, CartItem, PartnerOrder, PartnerOrderItem, PartnerOrderStatus } from "../types";

export type OrderItemSnapshotInput = {
  productId: string;
  externalProductRef: string;
  externalCharacteristicRef: string;
  externalUnitRef: string;
  externalVatRateRef: string;
  productName: string;
  sku: string;
  quantity: number;
  partnerUnitPrice: number;
  currencyCode: string;
  lineTotal: number;
  availableStock: number | null;
  nearestArrivalDate: string | null;
  nearestArrivalQuantity: number | null;
};

export interface CartRepository {
  findActive(companyId: string, userId: string): Promise<Cart | null>;
  listItems(cartId: string): Promise<CartItem[]>;
  addItem(companyId: string, productId: string, quantity: number): Promise<CartItem>;
  updateItemQuantity(itemId: string, quantity: number): Promise<CartItem>;
  removeItem(itemId: string): Promise<void>;
  mergeEstimateProducts(input: {
    companyId: string;
    estimateId: string;
    versionId: string | null;
    requestKey: string;
    items: Array<{ productId: string; quantity: number }>;
    summary: Record<string, number>;
  }): Promise<string>;
}

export interface PartnerOrderRepository {
  findBySubmissionKey(submissionKey: string): Promise<PartnerOrder | null>;
  listByCompanyId(companyId: string): Promise<PartnerOrder[]>;
  findById(orderId: string): Promise<PartnerOrder | null>;
  listItems(orderId: string): Promise<PartnerOrderItem[]>;
  listItemsByOrderIds(orderIds: string[]): Promise<PartnerOrderItem[]>;
  beginSubmission(input: {
    cartId: string;
    submissionKey: string;
    submissionAttemptId: string;
    requestedDeliveryDate: string;
    payloadSnapshot: Record<string, unknown>;
    items: OrderItemSnapshotInput[];
  }): Promise<PartnerOrder>;
  completeSubmission(input: {
    orderId: string;
    external1cRef: string;
    external1cNumber: string;
    external1cDate: string;
    oneCOrderStatus: string;
    documentTotal: number;
    currencyCode: string;
    contractNumber: string | null;
  }): Promise<PartnerOrder>;
  failSubmission(input: {
    orderId: string;
    status: PartnerOrderStatus.Failed | PartnerOrderStatus.Unknown;
    errorCode: string;
    errorMessage: string;
    errorDetails?: string | null;
    errorHint?: string | null;
  }): Promise<PartnerOrder>;
  confirmNotCreated(input: {
    orderId: string;
    submissionKey: string;
  }): Promise<PartnerOrder>;
  markManualReviewRequired(orderId: string): Promise<PartnerOrder>;
}

export class OrderRepositoryError extends Error {
  constructor(
    readonly code: string | null = null,
    readonly databaseMessage: string | null = null,
  ) {
    super("Order persistence failed.");
    this.name = "OrderRepositoryError";
  }
}
