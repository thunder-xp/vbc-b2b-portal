import type {
  AdminOrderHistoryBootstrapPage,
  OrderHistoryBootstrapClaim,
  OrderHistoryBootstrapState,
} from "../types";

export interface OrderHistoryBootstrapRepository {
  ensureFirstAccess(companyId: string, userId: string): Promise<OrderHistoryBootstrapState>;
  getStatus(companyId: string): Promise<OrderHistoryBootstrapState>;
  claim(): Promise<OrderHistoryBootstrapClaim | null>;
  complete(claim: OrderHistoryBootstrapClaim, result: Record<string, unknown>): Promise<void>;
  fail(claim: OrderHistoryBootstrapClaim, errorCode: string, retryable: boolean): Promise<void>;
  listAdmin(limit?: number): Promise<AdminOrderHistoryBootstrapPage>;
  enqueueAdmin(companyId: string): Promise<OrderHistoryBootstrapState>;
}

export class OrderHistoryBootstrapRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly databaseCode: string | null = null,
    readonly databaseMessage: string | null = null,
    readonly databaseDetails: string | null = null,
    readonly databaseHint: string | null = null,
    readonly databaseConstraint: string | null = null,
    options?: ErrorOptions,
  ) {
    super("Order-history bootstrap persistence failed.", options);
    this.name = "OrderHistoryBootstrapRepositoryError";
  }
}
