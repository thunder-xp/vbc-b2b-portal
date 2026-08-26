import { describe, expect, it } from "vitest";

import {
  OrderReconciliationRequiredError,
  OrderSubmissionInProgressError,
  RecoverableOrderSubmissionError,
} from "../../services";
import { orderSubmissionFailure } from "../order-action-error";

describe("orderSubmissionFailure", () => {
  it.each([
    [
      new RecoverableOrderSubmissionError(),
      "ORDER_UNKNOWN_FAILURE",
      "Заказ не был отправлен. Корзина сохранена. Повторите попытку.",
    ],
    [
      new RecoverableOrderSubmissionError(
        "Contract unavailable.",
        "ORDER_CONTRACT_MAPPING_MISSING",
      ),
      "ORDER_CONTRACT_MAPPING_MISSING",
      "Не удалось определить договор компании. Обратитесь к менеджеру Novotech.",
    ],
    [
      new RecoverableOrderSubmissionError(
        "Invalid date.",
        "ORDER_INVALID_SHIPMENT_DATE",
      ),
      "ORDER_INVALID_SHIPMENT_DATE",
      "Проверьте плановую дату отгрузки и повторите отправку.",
    ],
    [
      new RecoverableOrderSubmissionError(
        "ORDER_CONTRACT_INVALID",
        "ORDER_CONTRACT_INVALID",
        "12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ),
      "ORDER_CONTRACT_INVALID",
      "Договор для выбранного способа оплаты требует проверки Novotech. Корзина сохранена. Код обращения: ORD-12345678.",
    ],
    [
      new OrderSubmissionInProgressError(),
      "ORDER_IN_PROGRESS",
      "Заказ уже отправляется. Подождите завершения операции.",
    ],
    [
      new OrderReconciliationRequiredError(),
      "ORDER_RECONCILIATION_REQUIRED",
      "Статус отправки заказа уточняется. Не отправляйте заказ повторно.",
    ],
  ])("maps %s to a safe Russian action result", (error, code, message) => {
    expect(orderSubmissionFailure(error)).toEqual({
      success: false,
      errorCode: code,
      message,
      data: null,
    });
  });

  it("includes a safe correlation ID for infrastructure failures", () => {
    const error = new RecoverableOrderSubmissionError(
      "Database function is unavailable.",
      "ORDER_SUBMISSION_INFRASTRUCTURE_FAILURE",
      "test-correlation-id",
    );

    expect(orderSubmissionFailure(error)).toEqual({
      success: false,
      errorCode: "ORDER_SUBMISSION_INFRASTRUCTURE_FAILURE",
      message: "Заказ не был отправлен. Корзина сохранена. Код события: test-correlation-id.",
      data: null,
    });
  });

  it("returns a stable safe code for an unavailable authoritative price refresh", () => {
    const error = new RecoverableOrderSubmissionError(
      "technical provider detail",
      "ORDER_PRICE_REFRESH_FAILED",
      "12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );

    expect(orderSubmissionFailure(error)).toEqual({
      success: false,
      errorCode: "ORDER_PRICE_REFRESH_FAILED",
      message: "Не удалось подтвердить актуальность цены. Корзина сохранена. Код обращения: ORD-12345678.",
      data: null,
    });
  });

  it("asks for confirmation after an authoritative price change", () => {
    const error = new RecoverableOrderSubmissionError(
      "technical comparison detail",
      "ORDER_PRICE_CHANGED",
    );

    expect(orderSubmissionFailure(error)?.message).toBe(
      "Цена одной или нескольких позиций изменилась. Проверьте обновлённую корзину и подтвердите заказ повторно.",
    );
  });
});
