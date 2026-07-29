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
    return failure(error.code, recoverableMessage(error.code));
  }
  return null;
}

function recoverableMessage(code: RecoverableOrderSubmissionError["code"]): string {
  switch (code) {
    case "ORDER_COMPANY_MAPPING_MISSING":
      return "Не удалось определить данные компании в 1С. Обратитесь к менеджеру Novotech.";
    case "ORDER_CONTRACT_MAPPING_MISSING":
      return "Не удалось определить договор компании. Обратитесь к менеджеру Novotech.";
    case "ORDER_PRODUCT_MAPPING_MISSING":
      return "Один из товаров не связан с 1С. Корзина сохранена — обратитесь к менеджеру Novotech.";
    case "ORDER_PRICE_CHANGED":
      return "Цена товара изменилась. Обновите корзину и подтвердите заказ повторно.";
    case "ORDER_STOCK_CHANGED":
      return "Наличие товара изменилось. Проверьте корзину и подтвердите заказ повторно.";
    case "ORDER_INVALID_SHIPMENT_DATE":
      return "Проверьте плановую дату отгрузки и повторите отправку.";
    case "ORDER_CART_VERSION_CONFLICT":
      return "Корзина изменилась во время отправки. Проверьте позиции и повторите попытку.";
    case "ORDER_1C_VALIDATION_FAILED":
      return "1С отклонила данные заказа. Корзина сохранена — обратитесь к менеджеру Novotech.";
    case "ORDER_1C_TIMEOUT":
    case "ORDER_1C_ALREADY_CREATED":
    case "ORDER_READBACK_FAILED":
      return "Статус отправки заказа уточняется. Не отправляйте заказ повторно.";
    default:
      return "Заказ не был отправлен. Корзина сохранена — проверьте данные и повторите попытку.";
  }
}

function failure(errorCode: string, message: string): FailedActionResult {
  return { success: false, errorCode, message, data: null };
}
