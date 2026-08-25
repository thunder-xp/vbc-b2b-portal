import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartCheckoutCoordinator } from "../CartCheckoutCoordinator";
import { CartItemActions } from "../CartItemActions";
import { OrderSubmitForm } from "../OrderSubmitForm";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  remove: vi.fn(),
  submit: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("../../actions/cart.actions", () => ({
  removeCartItemAction: mocks.remove,
  updateCartItemAction: mocks.update,
}));
vi.mock("../../actions/order.actions", () => ({
  submitCartOrderAction: mocks.submit,
}));
vi.mock(
  "../../../behavior-analytics/components/BehaviorViewEvent",
  () => ({ recordBehaviorInteraction: vi.fn() }),
);

const cartId = "44444444-4444-4444-8444-444444444444";

describe("cart checkout mutation barrier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submit.mockResolvedValue({
      success: false,
      errorCode: "ORDER_UNKNOWN_FAILURE",
      message: "Заказ не был отправлен.",
      data: null,
    });
    mocks.remove.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Товар удалён.",
      data: null,
    });
  });

  it("flushes direct quantity input before checkout validation and submission", async () => {
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit");
    let resolveUpdate:
      | ((value: {
          success: true;
          errorCode: null;
          message: string;
          data: null;
        }) => void)
      | undefined;
    mocks.update.mockReturnValue(new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    const view = renderFlow();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество товара" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText(/Дата оплаты/), {
      target: { value: "2099-01-09" },
    });
    fireEvent.change(screen.getByLabelText("Дата планируемой отгрузки"), {
      target: { value: "2099-01-10" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Проверка заказа" }));

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.submit).not.toHaveBeenCalled();

    resolveUpdate?.({
      success: true,
      errorCode: null,
      message: "Количество обновлено.",
      data: null,
    });

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(
      view.container.querySelector<HTMLInputElement>(
        'input[name="expectedIntentVersion"]',
      ),
    ).toHaveValue("7");
  });

  it("does not submit when a visible quantity cannot be persisted", async () => {
    mocks.update.mockResolvedValue({
      success: false,
      errorCode: "INVALID_STATE",
      message: "Не удалось обновить количество.",
      data: null,
    });
    renderFlow();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество товара" }), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByLabelText(/Дата оплаты/), {
      target: { value: "2099-01-09" },
    });
    fireEvent.change(screen.getByLabelText("Дата планируемой отгрузки"), {
      target: { value: "2099-01-10" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Проверка заказа" }));

    expect(
      await screen.findByText(/Не удалось сохранить изменения корзины/),
    ).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("returns to the editable form when checkout becomes invalid after the barrier", async () => {
    let resolveUpdate:
      | ((value: {
          success: true;
          errorCode: null;
          message: string;
          data: null;
        }) => void)
      | undefined;
    mocks.update.mockReturnValue(new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    renderFlow();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество товара" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText(/Дата оплаты/), {
      target: { value: "2099-01-09" },
    });
    const date = screen.getByLabelText("Дата планируемой отгрузки");
    fireEvent.change(date, { target: { value: "2099-01-10" } });
    fireEvent.submit(screen.getByRole("form", { name: "Проверка заказа" }));
    fireEvent.change(date, { target: { value: "" } });

    resolveUpdate?.({
      success: true,
      errorCode: null,
      message: "Количество обновлено.",
      data: null,
    });

    await waitFor(() => expect(
      screen.getByRole("button", { name: "Отправить заказ" }),
    ).toBeDisabled());
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("shows the specific reconciliation message instead of a generic delete failure", async () => {
    mocks.remove.mockResolvedValueOnce({
      success: false,
      errorCode: "CART_RECONCILIATION_LOCKED",
      message: "correlation-1",
      data: null,
    });
    render(
      <CartCheckoutCoordinator>
        <CartItemActions itemId="item-1" quantity={2} />
      </CartCheckoutCoordinator>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(await screen.findByText(
      "Корзина временно заблокирована: проверяем результат предыдущей отправки заказа в 1С.",
    )).toBeInTheDocument();
  });

  it("disables cart mutation and submission controls while reconciliation is active", () => {
    render(
      <CartCheckoutCoordinator>
        <CartItemActions itemId="item-1" locked quantity={2} />
        <OrderSubmitForm
          cartId={cartId}
          reconciliationLocked
          submissionKey="55555555-5555-4555-8555-555555555555"
        />
      </CartCheckoutCoordinator>,
    );

    expect(screen.getByRole("button", { name: "Удалить" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Отправить заказ" })).toBeDisabled();
  });
});

function renderFlow() {
  return render(
    <CartCheckoutCoordinator>
      <CartItemActions itemId="item-1" quantity={2} />
      <OrderSubmitForm
        cartId={cartId}
        checkoutOptions={{
          counterpartyKind: "legal_entity",
          paymentMethods: [
            { value: "cashless", enabled: true, contractLabel: "NS-67/2104/22", unavailableReason: null },
            { value: "cash", enabled: false, contractLabel: null, unavailableReason: "contract_unavailable" },
          ],
          carriers: [],
        }}
        intentVersion={7}
        submissionKey="55555555-5555-4555-8555-555555555555"
      />
    </CartCheckoutCoordinator>,
  );
}
