import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CatalogQuantityCartAction } from "../../../catalog/components/CatalogQuantityCartAction";
import { OrderSubmitForm } from "../OrderSubmitForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../actions/cart.actions", () => ({ addToCartAction: vi.fn() }));
vi.mock("../../actions/order.actions", () => ({ submitCartOrderAction: vi.fn() }));
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({ recordBehaviorInteraction: vi.fn() }));

describe("partner buying-flow interaction boundaries", () => {
  it("uses labelled touch-sized quantity and cart controls", () => {
    render(<CatalogQuantityCartAction productId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByRole("spinbutton", { name: "Количество товара" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Добавить в корзину" })).toHaveClass("h-11");
  });

  it("presents a named review form and a single dominant submit action", () => {
    render(<OrderSubmitForm submissionKey="55555555-5555-4555-8555-555555555555" />);
    expect(screen.getByRole("form", { name: "Проверка и отправка заказа" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Отправить заказ" })).toHaveLength(1);
  });
});
