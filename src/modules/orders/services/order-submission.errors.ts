export class RecoverableOrderSubmissionError extends Error {
  constructor(message = "Order submission failed definitively.") {
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
