import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogQuantityCartAction } from "../../../catalog/components/CatalogQuantityCartAction";
import { addToCartAction } from "../../actions/cart.actions";
import { OrderSubmitForm } from "../OrderSubmitForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../actions/cart.actions", () => ({ addToCartAction: vi.fn() }));
vi.mock("../../actions/order.actions", () => ({ submitCartOrderAction: vi.fn() }));
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({ recordBehaviorInteraction: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addToCartAction).mockResolvedValue({ success: true, errorCode: null, message: "Добавлено", data: null });
});

describe("partner buying-flow interaction boundaries", () => {
  it("uses labelled touch-sized quantity and cart controls", () => {
    render(<CatalogQuantityCartAction productId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByRole("spinbutton", { name: "Количество товара" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "В корзину" })).toHaveClass("h-11");
  });

  it("validates direct quantity entry without silently replacing it", () => {
    render(<CatalogQuantityCartAction productId="11111111-1111-4111-8111-111111111111" />);
    const quantity = screen.getByRole("spinbutton", { name: "Количество товара" });
    fireEvent.change(quantity, { target: { value: "0" } });
    expect(quantity).toHaveValue(0);
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Введите целое количество от 1 до 9999.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeDisabled();
  });

  it("uses the visible quantity, reports success, and blocks rapid duplicate clicks", async () => {
    let resolveAction: ((value: Awaited<ReturnType<typeof addToCartAction>>) => void) | undefined;
    vi.mocked(addToCartAction).mockImplementation(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    render(<CatalogQuantityCartAction productId="11111111-1111-4111-8111-111111111111" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество товара" }), { target: { value: "3" } });
    const button = screen.getByRole("button", { name: "В корзину" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(addToCartAction).toHaveBeenCalledTimes(1);
    expect(addToCartAction).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", 3);

    resolveAction?.({ success: true, errorCode: null, message: "Добавлено", data: null });
    await waitFor(() => expect(screen.getByText("Добавлено в корзину: 3 шт.")).toBeInTheDocument());
  });

  it("presents a named review form and a single dominant submit action", () => {
    render(<OrderSubmitForm submissionKey="55555555-5555-4555-8555-555555555555" />);
    expect(screen.getByRole("form", { name: "Проверка и отправка заказа" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Отправить заказ" })).toHaveLength(1);
  });
});
