import type { OrderDateChangeRequest } from "../types";

export type InternalOrderDateChangeRecord = {
  request: OrderDateChangeRequest;
  companyName: string;
  orderLabel: string;
  authoritativeDate: string;
};

export interface OrderDateChangeRequestRepository {
  listLatestByOrderIds(orderIds: string[]): Promise<Map<string, OrderDateChangeRequest>>;
  create(input: { orderHistoryId: string; requestedDate: string; comment: string | null }): Promise<OrderDateChangeRequest>;
  cancel(requestId: string): Promise<OrderDateChangeRequest>;
  listPendingForReview(): Promise<InternalOrderDateChangeRecord[]>;
  canReviewInternally(): Promise<boolean>;
  review(input: { requestId: string; decision: "approved" | "rejected"; comment: string | null }): Promise<OrderDateChangeRequest>;
}

export class OrderDateChangeRepositoryError extends Error {
  constructor(readonly code: string | null = null) { super("Order date-change persistence failed."); this.name = "OrderDateChangeRepositoryError"; }
}
