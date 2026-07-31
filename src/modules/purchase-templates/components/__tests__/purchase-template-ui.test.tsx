import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PurchaseTemplateDetailDto } from "../../types";
import { PurchaseTemplateCreateForm } from "../PurchaseTemplateCreateForm";
import { PurchaseTemplateEditor } from "../PurchaseTemplateEditor";
import { SaveAsPurchaseTemplateButton } from "../SaveAsPurchaseTemplateButton";

const push = vi.fn(); const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../../../behavior-analytics/components", () => ({ recordBehaviorInteraction: vi.fn() }));
vi.mock("../../../catalog/actions", () => ({ searchCatalogSuggestionsAction: vi.fn().mockResolvedValue([]) }));
vi.mock("../../actions", () => ({
  createPurchaseTemplateAction: vi.fn().mockResolvedValue({ success: true, data: { id: "template-1" }, message: "Создан" }),
  createPurchaseTemplateFromCartAction: vi.fn().mockResolvedValue({ success: true, data: { id: "template-1" }, message: "Создан" }),
  createPurchaseTemplateFromOrderAction: vi.fn().mockResolvedValue({ success: true, data: { id: "template-1" }, message: "Создан" }),
  createPurchaseTemplateFromPurchasingListAction: vi.fn().mockResolvedValue({ success: true, data: { id: "template-1" }, message: "Создан" }),
  addPurchaseTemplateToCartAction: vi.fn().mockResolvedValue({ success: true, data: { added: 1 }, message: "Добавлено" }),
  updatePurchaseTemplateAction: vi.fn().mockResolvedValue({ success: true, data: { revision: 2 }, message: "Сохранено" }),
  copyPurchaseTemplateAction: vi.fn().mockResolvedValue({ success: true, data: { id: "template-2" }, message: "Скопировано" }),
  archivePurchaseTemplateAction: vi.fn().mockResolvedValue({ success: true, data: null, message: "Архивировано" }),
}));

describe("purchase template UI", () => {
  beforeEach(() => { push.mockReset(); refresh.mockReset(); });

  it("creates private and company templates through accessible controls", async () => {
    render(<PurchaseTemplateCreateForm />);
    expect(screen.getByRole("radio", { name: /Личный/ })).toBeChecked();
    await userEvent.type(screen.getByRole("textbox", { name: "Название" }), "Ежемесячное пополнение");
    await userEvent.click(screen.getByRole("radio", { name: /Для компании/ }));
    await userEvent.click(screen.getByRole("button", { name: "Создать шаблон" }));
    expect(push).toHaveBeenCalledWith("/cabinet/purchase-templates/template-1");
  });

  it("keeps current commercial warnings visible and actions keyboard-accessible", () => {
    render(<PurchaseTemplateEditor initial={detail()} />);
    expect(screen.getByText("Current camera")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("В наличии")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Проверить и добавить в корзину" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Переместить вверх" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Удалить позицию" })).toHaveClass("size-11");
  });

  it("keeps unavailable intent visible but excludes it from execution", () => {
    render(<PurchaseTemplateEditor initial={detail({ lines: [{ ...detail().lines[0], state: "unavailable", stateLabel: "Нет в наличии", eligible: false, availableQuantity: 0 }], summary: { ...detail().summary, eligible: 0, unavailable: 1 } })} />);
    expect(screen.getAllByText("Нет в наличии")).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: /Выбрать/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Проверить и добавить в корзину" })).toBeDisabled();
  });

  it("explains invalid half-quantity without horizontal table dependence", async () => {
    render(<PurchaseTemplateEditor initial={detail({ lines: [{ ...detail().lines[0], preferredQuantity: 1 }] })} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Множитель" }), "0.5");
    expect(screen.getByText(/станет дробным/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Проверить и добавить в корзину" })).toBeDisabled();
    expect(document.querySelector("table")).toBeNull();
  });

  it.each([
    [{ type: "cart" } as const, "Сохранить как шаблон закупки"],
    [{ type: "order", id: "order-1" } as const, "Сохранить как шаблон закупки"],
    [{ type: "purchasing_list", id: "list-1" } as const, "Сохранить как шаблон закупки"],
  ])("opens a source conversion dialog", async (source, label) => {
    render(<SaveAsPurchaseTemplateButton source={source} />);
    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("form", { name: label })).toBeInTheDocument();
  });
});

function detail(overrides: Partial<PurchaseTemplateDetailDto> = {}): PurchaseTemplateDetailDto {
  return { id: "33333333-3333-4333-8333-333333333333", companyId: "company-1", ownerUserId: "user-1", name: "Monthly", description: null, visibility: "private", status: "active", sourceType: "manual", sourceId: null, usageCount: 0, lastUsedAt: null, revision: 1, createdAt: "2026-07-31T00:00:00Z", updatedAt: "2026-07-31T00:00:00Z", archivedAt: null, ownerName: "Partner", canEdit: true, lines: [{ id: "44444444-4444-4444-8444-444444444444", templateId: "33333333-3333-4333-8333-333333333333", productId: "55555555-5555-4555-8555-555555555555", preferredQuantity: 2, lineNote: null, sortOrder: 1, createdAt: "2026-07-31T00:00:00Z", updatedAt: "2026-07-31T00:00:00Z", sku: "400691", productName: "Current camera", slug: "camera", imageUrl: null, currentUnitPrice: "$10.00", currentUnitPriceAmount: 10, currentCurrencyCode: "USD", lineTotal: "$20.00", availableQuantity: 10, expectedArrivalDate: null, expectedArrivalQuantity: null, state: "available", stateLabel: "В наличии", eligible: true }], summary: { totalPositions: 1, eligible: 1, unavailable: 0, expected: 0, unpublished: 0, restricted: 0, priceUnavailable: 0, quantityExceedsStock: 0, totals: [{ currencyCode: "USD", amount: 20, formatted: "$20.00" }] }, ...overrides };
}
