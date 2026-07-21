import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PurchasingListDetailDto } from "../../types";
import { PurchasingListCreateForm } from "../PurchasingListCreateForm";
import { PurchasingListEditor } from "../PurchasingListEditor";

const push = vi.fn(); const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../../actions", () => ({
  createPurchasingListAction: vi.fn().mockResolvedValue({ success: true, data: { id: "list-1" }, message: "Создано" }),
  addPurchasingListToCartAction: vi.fn().mockResolvedValue({ success: true, data: { destinationId: "cart-1" }, message: "Добавлено" }),
  createEstimateFromPurchasingListAction: vi.fn().mockResolvedValue({ success: true, data: { estimateId: "estimate-1" }, message: "Создано" }),
  removePurchasingListItemsAction: vi.fn().mockResolvedValue({ success: true, data: {}, message: "Удалено" }),
  updatePurchasingListItemsAction: vi.fn().mockResolvedValue({ success: true, data: {}, message: "Сохранено" }),
  updatePurchasingListMetadataAction: vi.fn().mockResolvedValue({ success: true, data: {}, message: "Сохранено" }),
}));

describe("purchasing list UI", () => {
  beforeEach(() => { push.mockReset(); refresh.mockReset(); });
  it("creates private and company lists with accessible controls", async () => {
    render(<PurchasingListCreateForm />);
    expect(screen.getByRole("radio", { name: /Личный/ })).toBeChecked();
    await userEvent.type(screen.getByRole("textbox", { name: "Название" }), "Комплект видеонаблюдения");
    await userEvent.click(screen.getByRole("radio", { name: /Для компании/ }));
    await userEvent.click(screen.getByRole("button", { name: "Создать список" }));
    expect(push).toHaveBeenCalledWith("/cabinet/purchasing-lists/list-1");
  });

  it("renders compact wrapping product lines and keyboard-accessible ordering controls", async () => {
    render(<PurchasingListEditor initial={detail()} />);
    expect(screen.getByText("Very long camera product name that must wrap on mobile layouts")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Very long camera/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Примечание" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Переместить вверх" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Выбрать/ }));
    expect(screen.getByRole("button", { name: /Выбранное в корзину/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Все доступное в корзину/ })).toBeEnabled();
  });

  it("keeps archived lists immutable and removes conversion controls", () => {
    render(<PurchasingListEditor initial={{ ...detail(), archivedAt: "2026-07-20T12:00:00Z" }} />);
    expect(screen.getByRole("textbox", { name: "Название" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Количество" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /корзину/i })).not.toBeInTheDocument();
  });

  it("protects favorites metadata while keeping quantity editable", () => {
    render(<PurchasingListEditor initial={{ ...detail(), isSystemFavorites: true, canManage: false }} />);
    expect(screen.queryByRole("textbox", { name: "Название" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Количество" })).toBeEnabled();
  });

  it("shows current price, stock, and arrival without persisting them in inputs", () => {
    const { container } = render(<PurchasingListEditor initial={detail()} />);
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/Поступление:/)).toBeInTheDocument();
    expect(container.querySelector('input[name="price"]')).toBeNull();
  });
});

function detail(): PurchasingListDetailDto { return { id: "33333333-3333-4333-8333-333333333333", companyId: "company-1", name: "Install kit", description: null, visibility: "private", createdBy: "user-1", updatedBy: "user-1", revision: 1, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z", archivedAt: null, ownerName: "Partner", canManage: true, lines: [{ id: "44444444-4444-4444-8444-444444444444", listId: "33333333-3333-4333-8333-333333333333", productId: "55555555-5555-4555-8555-555555555555", quantity: 2, position: 1, note: null, sourceType: "manual", sourceReferenceId: null, sourceUnitPrice: null, sourceCurrencyCode: null, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z", sku: "400691", productName: "Very long camera product name that must wrap on mobile layouts", slug: "camera", imageUrl: null, currentPartnerPrice: "$10.00", currentPartnerPriceAmount: 10, currentCurrencyCode: "USD", availableStock: 5, expectedArrivalDate: "2026-07-25", expectedArrivalQuantity: 10, state: "available", stateLabel: "Доступно", canConvert: true }] }; }
