import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartCheckoutCoordinator } from "../CartCheckoutCoordinator";
import { CartItemActions } from "../CartItemActions";
import { OrderSubmitForm } from "../OrderSubmitForm";

const mocks = vi.hoisted(() => ({
  getIntent: vi.fn(),
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
  getCartCheckoutIntentAction: mocks.getIntent,
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
    mocks.getIntent.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Cart intent loaded.",
      data: { cartId, intentVersion: 8 },
    });
    mocks.submit.mockResolvedValue({
      success: false,
      errorCode: "ORDER_UNKNOWN_FAILURE",
      message: "Заказ не был отправлен.",
      data: null,
    });
  });

  it("flushes direct quantity input before checkout validation and submission", async () => {
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
    fireEvent.change(screen.getByLabelText("Дата планируемой отгрузки"), {
      target: { value: "2099-01-10" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Проверка и отправка заказа" }));

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.getIntent).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();

    resolveUpdate?.({
      success: true,
      errorCode: null,
      message: "Количество обновлено.",
      data: null,
    });

    await waitFor(() => expect(mocks.getIntent).toHaveBeenCalledWith(cartId));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
    expect(
      view.container.querySelector<HTMLInputElement>(
        'input[name="expectedIntentVersion"]',
      ),
    ).toHaveValue("8");
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
    fireEvent.change(screen.getByLabelText("Дата планируемой отгрузки"), {
      target: { value: "2099-01-10" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Проверка и отправка заказа" }));

    expect(
      await screen.findByText(/Не удалось сохранить изменения корзины/),
    ).toBeInTheDocument();
    expect(mocks.getIntent).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});

function renderFlow() {
  return render(
    <CartCheckoutCoordinator>
      <CartItemActions itemId="item-1" quantity={2} />
      <OrderSubmitForm
        cartId={cartId}
        intentVersion={7}
        submissionKey="55555555-5555-4555-8555-555555555555"
      />
    </CartCheckoutCoordinator>,
  );
}
