import type { OrderDateChangeRequest } from "../types";

export interface OrderDateChangeRequestRepository {
  listLatestByOrderIds(orderIds: string[]): Promise<Map<string, OrderDateChangeRequest>>;
  create(input: { orderHistoryId: string; requestedDate: string; comment: string | null }): Promise<OrderDateChangeRequest>;
  cancel(requestId: string): Promise<OrderDateChangeRequest>;
}

export class OrderDateChangeRepositoryError extends Error {
  constructor(readonly code: string | null = null) { super("Order date-change persistence failed."); this.name = "OrderDateChangeRepositoryError"; }
}
