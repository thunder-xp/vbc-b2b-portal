import { describe, expect, it } from "vitest";

import { OrderReconciliationRequiredError, OrderSubmissionInProgressError, RecoverableOrderSubmissionError } from "../../services";
import { orderSubmissionFailure } from "../order-action-error";

describe("orderSubmissionFailure", () => {
  it.each([
    [new RecoverableOrderSubmissionError(), "ORDER_RECOVERABLE", "Заказ не был отправлен. Корзина сохранена — проверьте данные и повторите попытку."],
    [new OrderSubmissionInProgressError(), "ORDER_IN_PROGRESS", "Заказ уже отправляется. Подождите завершения операции."],
    [new OrderReconciliationRequiredError(), "ORDER_RECONCILIATION_REQUIRED", "Статус отправки заказа уточняется. Не отправляйте заказ повторно."],
  ])("maps %s to a safe Russian action result", (error, code, message) => {
    expect(orderSubmissionFailure(error)).toEqual({ success: false, errorCode: code, message, data: null });
  });
});
