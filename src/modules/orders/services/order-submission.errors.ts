export type RecoverableOrderSubmissionCode =
  | "ORDER_COMPANY_MAPPING_MISSING"
  | "ORDER_CONTRACT_MAPPING_MISSING"
  | "ORDER_PRODUCT_MAPPING_MISSING"
  | "ORDER_PRICE_REFRESH_REQUIRED"
  | "ORDER_PRICE_REFRESH_FAILED"
  | "ORDER_PRICE_CHANGED"
  | "ORDER_PRICE_DATA_MISSING"
  | "ORDER_PRICE_STALE"
  | "ORDER_STOCK_CHANGED"
  | "ORDER_INVALID_SHIPMENT_DATE"
  | "ORDER_CART_VERSION_CONFLICT"
  | "ORDER_1C_VALIDATION_FAILED"
  | "ORDER_1C_TIMEOUT"
  | "ORDER_1C_ALREADY_CREATED"
  | "ORDER_READBACK_FAILED"
  | "ORDER_SUBMISSION_INFRASTRUCTURE_FAILURE"
  | "ORDER_UNKNOWN_FAILURE";

export class RecoverableOrderSubmissionError extends Error {
  constructor(
    message = "Order submission failed definitively.",
    readonly code: RecoverableOrderSubmissionCode = "ORDER_UNKNOWN_FAILURE",
    readonly correlationId = crypto.randomUUID(),
  ) {
    super(message);
    this.name = "RecoverableOrderSubmissionError";
  }
}

export class OrderSubmissionInProgressError extends Error {
  constructor() {
    super("Order submission is already in progress.");
    this.name = "OrderSubmissionInProgressError";
  }
}

export class OrderReconciliationRequiredError extends Error {
  constructor() {
    super("Order submission requires reconciliation.");
    this.name = "OrderReconciliationRequiredError";
  }
}
