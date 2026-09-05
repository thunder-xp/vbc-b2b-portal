import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogQuantityCartAction } from "../../../catalog/components/CatalogQuantityCartAction";
import { OrderSubmitForm } from "../OrderSubmitForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../actions/order.actions", () => ({ submitCartOrderAction: vi.fn() }));
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({ recordBehaviorInteraction: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

const selectionProduct = { id: "11111111-1111-4111-8111-111111111111", sku: "400540", name: "Camera", slug: "camera", imageUrl: null, partnerPrice: null, stock: null };

describe("partner buying-flow interaction boundaries", () => {
  it("uses labelled touch-sized quantity and cart controls", () => {
    render(<CatalogQuantityCartAction productId={selectionProduct.id} selectionProduct={selectionProduct} />);
    expect(screen.getByRole("spinbutton", { name: "Количество товара" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "В подборку" })).toHaveClass("h-11");
  });

  it("validates direct quantity entry without silently replacing it", () => {
    render(<CatalogQuantityCartAction productId={selectionProduct.id} selectionProduct={selectionProduct} />);
    const quantity = screen.getByRole("spinbutton", { name: "Количество товара" });
    fireEvent.change(quantity, { target: { value: "0" } });
    expect(quantity).toHaveValue(0);
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Введите целое количество от 1 до 9999.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В подборку" })).toBeDisabled();
  });

  it("uses the visible quantity and emits a local selection update", () => {
    const added = vi.fn();
    window.addEventListener("novotech:live-selection-add", added);
    render(<CatalogQuantityCartAction productId={selectionProduct.id} selectionProduct={selectionProduct} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество товара" }), { target: { value: "3" } });
    const button = screen.getByRole("button", { name: "В подборку" });
    fireEvent.click(button);
    expect(added).toHaveBeenCalledOnce();
    expect((added.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({ quantity: 3 });
    expect(screen.getByText("Добавлено: 3 шт.")).toBeInTheDocument();
    window.removeEventListener("novotech:live-selection-add", added);
  });

  it("presents a named review form and a single dominant submit action", () => {
    render(<OrderSubmitForm submissionKey="55555555-5555-4555-8555-555555555555" />);
    expect(screen.getByRole("form", { name: "Проверка заказа" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Отправить заказ" })).toHaveLength(1);
  });
});
