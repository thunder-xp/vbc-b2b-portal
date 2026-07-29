import {
  IntegrationHttpError,
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
  IntegrationValidationError,
} from "../../integration/errors";
import { OrderHistoryRepositoryError } from "../repositories";

export type OrderHistorySyncErrorCode =
  | "ORDER_HISTORY_COMPANY_MAPPING_MISSING"
  | "ORDER_HISTORY_1C_QUERY_INVALID"
  | "ORDER_HISTORY_1C_UNAVAILABLE"
  | "ORDER_HISTORY_TIMEOUT"
  | "ORDER_HISTORY_PAGINATION_FAILED"
  | "ORDER_HISTORY_HEADER_MAPPING_FAILED"
  | "ORDER_HISTORY_LINE_MAPPING_FAILED"
  | "ORDER_HISTORY_PERSISTENCE_FAILED"
  | "ORDER_HISTORY_LOCKED"
  | "ORDER_HISTORY_PARTIAL_SUCCESS"
  | "ORDER_HISTORY_UNKNOWN_FAILURE";

export class OrderHistorySyncError extends Error {
  readonly correlationId: string;

  constructor(
    readonly code: OrderHistorySyncErrorCode,
    options?: { cause?: unknown; correlationId?: string },
  ) {
    super("Partner order history synchronization failed.", { cause: options?.cause });
    this.name = "OrderHistorySyncError";
    this.correlationId = options?.correlationId ?? crypto.randomUUID();
  }
}

export function classifyOrderHistorySyncError(error: unknown, partial: boolean): OrderHistorySyncError {
  if (error instanceof OrderHistorySyncError) return error;
  if (partial) return new OrderHistorySyncError("ORDER_HISTORY_PARTIAL_SUCCESS", { cause: error });
  if (error instanceof IntegrationTimeoutError) return new OrderHistorySyncError("ORDER_HISTORY_TIMEOUT", { cause: error });
  if (error instanceof IntegrationProviderUnavailableError) {
    return new OrderHistorySyncError("ORDER_HISTORY_1C_UNAVAILABLE", { cause: error });
  }
  if (error instanceof IntegrationHttpError) return new OrderHistorySyncError("ORDER_HISTORY_1C_QUERY_INVALID", { cause: error });
  if (error instanceof IntegrationValidationError) {
    return new OrderHistorySyncError("ORDER_HISTORY_HEADER_MAPPING_FAILED", { cause: error });
  }
  if (error instanceof OrderHistoryRepositoryError) {
    return new OrderHistorySyncError("ORDER_HISTORY_PERSISTENCE_FAILED", { cause: error });
  }
  if (error instanceof Error && /page|pagination|cursor/i.test(error.message)) {
    return new OrderHistorySyncError("ORDER_HISTORY_PAGINATION_FAILED", { cause: error });
  }
  return new OrderHistorySyncError("ORDER_HISTORY_UNKNOWN_FAILURE", { cause: error });
}
