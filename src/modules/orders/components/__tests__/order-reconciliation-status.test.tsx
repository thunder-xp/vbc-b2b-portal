import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ORDER_RECONCILIATION_POLL_DURATION_MS,
  ORDER_RECONCILIATION_POLL_INTERVAL_MS,
  OrderReconciliationStatus,
} from "../OrderReconciliationStatus";

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("../../actions/order.actions", () => ({
  getPartnerOrderReconciliationStateAction: mocks.getState,
}));

const checking = {
  orderId: "944d1410-c695-4fc8-ac16-601d92b8115f",
  state: "checking" as const,
  external1cNumber: null,
};

describe("OrderReconciliationStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("explains automatic checking and preserved-cart safety without internal details", () => {
    render(<OrderReconciliationStatus initialState={checking} surface="cart" />);

    expect(screen.getByText("Проверяем создание заказа в 1С…")).toBeInTheDocument();
    expect(screen.getByText(/Корзина сохранена, проверка выполняется автоматически/)).toBeInTheDocument();
    expect(screen.getByText("Проверка обычно занимает несколько минут.")).toBeInTheDocument();
    expect(screen.queryByText(/SQLSTATE|RPC|попытк/i)).not.toBeInTheDocument();
  });

  it("stops polling and restores the retry message when 1C confirms no order", async () => {
    mocks.getState.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "loaded",
      data: { ...checking, state: "confirmed_not_created" },
    });
    render(<OrderReconciliationStatus initialState={checking} surface="cart" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_RECONCILIATION_POLL_INTERVAL_MS);
    });

    expect(screen.getByText("Заказ не был создан в 1С. Корзина сохранена — можно повторить отправку.")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.getState).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_RECONCILIATION_POLL_INTERVAL_MS * 2);
    });
    expect(mocks.getState).toHaveBeenCalledOnce();
  });

  it("opens the normal submitted-order success route when reconciliation confirms creation", async () => {
    mocks.getState.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "loaded",
      data: { ...checking, state: "confirmed_created", external1cNumber: "NSUU-1" },
    });
    render(<OrderReconciliationStatus initialState={checking} surface="cart" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_RECONCILIATION_POLL_INTERVAL_MS);
    });

    expect(mocks.replace).toHaveBeenCalledWith(
      "/cabinet/orders/944d1410-c695-4fc8-ac16-601d92b8115f?submitted=1",
    );
    expect(mocks.getState).toHaveBeenCalledOnce();
  });

  it("renders a resolved order-detail recovery action without polling", async () => {
    render(
      <OrderReconciliationStatus
        initialState={{ ...checking, state: "confirmed_not_created" }}
        surface="order"
      />,
    );

    expect(screen.getByRole("link", { name: "Вернуться в корзину" }))
      .toHaveAttribute("href", "/cabinet/cart");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_RECONCILIATION_POLL_INTERVAL_MS * 2);
    });
    expect(mocks.getState).not.toHaveBeenCalled();
  });

  it("keeps polling bounded to ten minutes", () => {
    expect(ORDER_RECONCILIATION_POLL_INTERVAL_MS).toBe(5_000);
    expect(ORDER_RECONCILIATION_POLL_DURATION_MS).toBe(600_000);
  });
});
