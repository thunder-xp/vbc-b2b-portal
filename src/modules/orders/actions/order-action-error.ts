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
    return failure(
      "ORDER_RECONCILIATION_REQUIRED",
      "Статус отправки заказа уточняется. Не отправляйте заказ повторно.",
    );
  }
  if (error instanceof RecoverableOrderSubmissionError) {
    return failure(error.code, recoverableMessage(error));
  }
  return null;
}

function recoverableMessage(error: RecoverableOrderSubmissionError): string {
  switch (error.code) {
    case "ORDER_COMPANY_MAPPING_MISSING":
      return "Не удалось определить данные компании в 1С. Обратитесь к менеджеру Novotech.";
    case "ORDER_CONTRACT_MAPPING_MISSING":
      return "Не удалось определить договор компании. Обратитесь к менеджеру Novotech.";
    case "ORDER_PRODUCT_MAPPING_MISSING":
      return "Один из товаров не связан с 1С. Корзина сохранена — обратитесь к менеджеру Novotech.";
    case "ORDER_PRICE_REFRESH_FAILED":
      return `Не удалось подтвердить актуальность цены. Корзина сохранена. Код обращения: ${orderCorrelationCode(error.correlationId)}.`;
    case "ORDER_PRICE_CHANGED":
      return "Цена одной или нескольких позиций изменилась. Проверьте обновлённую корзину и подтвердите заказ повторно.";
    case "ORDER_PRICE_DATA_MISSING":
      return "Не удалось получить актуальную цену одной или нескольких позиций. Корзина сохранена — обратитесь к менеджеру Novotech.";
    case "ORDER_PRICE_REFRESH_REQUIRED":
    case "ORDER_PRICE_STALE":
      return `Не удалось подтвердить актуальность цены. Корзина сохранена. Код обращения: ${orderCorrelationCode(error.correlationId)}.`;
    case "ORDER_STOCK_CHANGED":
      return "Данные некоторых позиций обновились. Проверьте изменения перед отправкой.";
    case "ORDER_INVALID_SHIPMENT_DATE":
      return "Проверьте плановую дату отгрузки и повторите отправку.";
    case "ORDER_CART_VERSION_CONFLICT":
      return "Корзина была изменена в другой вкладке или на другом устройстве. Мы загрузили актуальную версию.";
    case "ORDER_COUNTERPARTY_TYPE_UNSUPPORTED":
      return correlatedMessage("Тип клиента не поддерживается для отправки заказа. Обратитесь к менеджеру Novotech.", error);
    case "ORDER_PAYMENT_CONFIGURATION_INVALID":
      return correlatedMessage("Проверьте способ и дату оплаты. Если ошибка повторится, обратитесь к менеджеру Novotech.", error);
    case "ORDER_FULFILLMENT_CONFIGURATION_INVALID":
      return correlatedMessage("Проверьте способ получения заказа и перевозчика.", error);
    case "ORDER_PAYMENT_METHOD_UNAVAILABLE":
    case "ORDER_CONTRACT_INVALID":
      return correlatedMessage("Для выбранного способа оплаты нет действующего договора. Выберите другой доступный способ оплаты.", error);
    case "ORDER_PAYLOAD_VALIDATION_FAILED":
      return correlatedMessage("Данные заказа не прошли проверку. Корзина сохранена — обратитесь к менеджеру Novotech.", error);
    case "ORDER_1C_VALIDATION_FAILED":
      return "1С отклонила данные заказа. Корзина сохранена — обратитесь к менеджеру Novotech.";
    case "ORDER_1C_TIMEOUT":
    case "ORDER_1C_ALREADY_CREATED":
    case "ORDER_READBACK_FAILED":
      return "Статус отправки заказа уточняется. Не отправляйте заказ повторно.";
    case "ORDER_SUBMISSION_INFRASTRUCTURE_FAILURE":
      return `Заказ не был отправлен. Корзина сохранена. Код события: ${error.correlationId}.`;
    default:
      return "Заказ не был отправлен. Корзина сохранена. Повторите попытку.";
  }
}

function correlatedMessage(message: string, error: RecoverableOrderSubmissionError): string {
  return `${message} Код обращения: ${orderCorrelationCode(error.correlationId)}.`;
}

function orderCorrelationCode(correlationId: string): string {
  return `ORD-${correlationId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function failure(errorCode: string, message: string): FailedActionResult {
  return { success: false, errorCode, message, data: null };
}
