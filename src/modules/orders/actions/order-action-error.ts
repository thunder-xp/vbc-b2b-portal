import type { FailedActionResult } from "../../access-control/actions/action-result";
import {
  OrderReconciliationRequiredError,
  OrderSubmissionInProgressError,
  RecoverableOrderSubmissionError,
} from "../services";

export function orderSubmissionFailure(error: unknown): FailedActionResult | null {
  if (error instanceof OrderSubmissionInProgressError) {
    return failure("ORDER_IN_PROGRESS", "Заказ уже отправляется. Подождите завершения операции.");
  }
  if (error instanceof OrderReconciliationRequiredError) {
    return failure("ORDER_RECONCILIATION_REQUIRED", "Статус отправки заказа уточняется. Не отправляйте заказ повторно.");
  }
  if (error instanceof RecoverableOrderSubmissionError) {
    return failure("ORDER_RECOVERABLE", "Заказ не был отправлен. Корзина сохранена — проверьте данные и повторите попытку.");
  }
  return null;
}

function failure(errorCode: string, message: string): FailedActionResult {
  return { success: false, errorCode, message, data: null };
}
