import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PurchasingListDetailDto } from "../../types";
import { PurchasingListCreateForm } from "../PurchasingListCreateForm";
import { PurchasingListEditor } from "../PurchasingListEditor";
import { PartnerLocaleProvider } from "../../../partner-locale/PartnerLocaleProvider";
import * as actions from "../../actions";

const push = vi.fn(); const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../../actions", () => ({
  createPurchasingListAction: vi.fn().mockResolvedValue({ success: true, data: { id: "list-1" }, message: "Создано" }),
  addPurchasingListToCartAction: vi.fn().mockResolvedValue({ success: true, data: { destinationId: "cart-1", added: 1 }, message: "Добавлено" }),
  createEstimateFromPurchasingListAction: vi.fn().mockResolvedValue({ success: true, data: { estimateId: "estimate-1" }, message: "Создано" }),
  removePurchasingListItemsAction: vi.fn().mockResolvedValue({ success: true, data: {}, message: "Удалено" }),
  updatePurchasingListItemsAction: vi.fn().mockResolvedValue({ success: true, data: {}, message: "Сохранено" }),
  updatePurchasingListMetadataAction: vi.fn().mockResolvedValue({ success: true, data: {}, message: "Сохранено" }),
  duplicatePurchasingListAction: vi.fn().mockResolvedValue({ success: true, data: { id: "copy-1" }, message: "Сохранено" }),
  setPurchasingListArchivedAction: vi.fn().mockResolvedValue({ success: true, data: {}, message: "Сохранено" }),
}));

describe("purchasing list UI", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("creates private and company lists with accessible controls", async () => {
    render(<PurchasingListCreateForm />);
    expect(screen.getByRole("radio", { name: /Личный/ })).toBeChecked();
    await userEvent.type(screen.getByRole("textbox", { name: "Название" }), "Комплект видеонаблюдения");
    await userEvent.click(screen.getByRole("radio", { name: /Для компании/ }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить комплект" }));
    expect(push).toHaveBeenCalledWith("/cabinet/purchasing-lists/list-1");
  });

  it("renders compact wrapping product lines and keyboard-accessible ordering controls", async () => {
    render(<PurchasingListEditor initial={detail()} />);
    expect(screen.getByText("Very long camera product name that must wrap on mobile layouts")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Very long camera/ })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Примечание" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Переместить вверх" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Выбрать/ }));
    expect(screen.getByRole("button", { name: "В корзину" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "В корзину" })).toHaveLength(1);
  });

  it("adds one kit row with its current quantity through the existing list-to-cart action", async () => {
    const initial = detail();
    initial.lines[0].availableStock = 10;
    render(<PurchasingListEditor initial={initial} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество" }), { target: { value: "5" } });
    const rowAction = screen.getByRole("button", { name: "Добавить в корзину" });
    expect(rowAction).toHaveClass("size-11");
    expect(rowAction).toHaveAttribute("data-cart-state", "idle");
    expect(screen.getByRole("tooltip", { name: "Добавить в корзину" })).toHaveClass("hidden", "group-hover/icon-action-tooltip:block", "group-focus-within/icon-action-tooltip:block");

    await userEvent.click(rowAction);
    await waitFor(() => expect(actions.addPurchasingListToCartAction).toHaveBeenCalledExactlyOnceWith({
      listId: initial.id,
      requestKey: expect.any(String),
      selections: [{ itemId: initial.lines[0].id, quantity: 5 }],
    }));
    expect(initial.lines[0].quantity).toBe(2);
    expect(actions.updatePurchasingListItemsAction).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Добавить в корзину" })).toHaveAttribute("data-cart-state", "success"));
    expect(screen.getByText("Товар добавлен в корзину.")).toHaveClass("sr-only");
    expect(refresh).toHaveBeenCalled();
  });

  it("updates the local final-quantity decision after a successful row add", async () => {
    const initial = detail();
    render(<PurchasingListEditor initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: "Добавить в корзину" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество" }), { target: { value: "4" } });
    expect(screen.getByRole("button", { name: /Добавить в корзину\. Недостаточно товара на складе/ })).toBeDisabled();
  });

  it("keeps review-required rows enabled when stock admission passes", () => {
    const initial = detail();
    initial.lines[0].canConvert = false;
    initial.lines[0].state = "requires_review";
    render(<PurchasingListEditor initial={initial} />);
    expect(screen.getByRole("button", { name: "Добавить в корзину" })).toBeEnabled();
    expect(actions.addPurchasingListToCartAction).not.toHaveBeenCalled();
  });

  it.each([4, 5])("hides the row review warning when quantity %s is covered by known stock", (quantity) => {
    const initial = reviewRequiredDetail();
    initial.lines[0].quantity = quantity;
    initial.lines[0].availableStock = 5;
    render(<PurchasingListEditor initial={initial} />);
    expect(screen.queryByText("Требует проверки")).not.toBeInTheDocument();
  });

  it("shows the row review warning when quantity exceeds known stock", () => {
    const initial = reviewRequiredDetail();
    initial.lines[0].quantity = 6;
    initial.lines[0].availableStock = 5;
    render(<PurchasingListEditor initial={initial} />);
    expect(screen.getByText("Требует проверки")).toBeInTheDocument();
  });

  it("keeps the row review warning when stock is unknown", () => {
    const initial = reviewRequiredDetail();
    initial.lines[0].availableStock = null;
    render(<PurchasingListEditor initial={initial} />);
    expect(screen.getByText("Требует проверки")).toBeInTheDocument();
    expect(screen.getByText("Уточняется")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить в корзину" })).toBeEnabled();
  });

  it("updates the row warning across the stock threshold without changing review metadata", () => {
    const initial = reviewRequiredDetail();
    render(<PurchasingListEditor initial={initial} />);
    const quantity = screen.getByRole("spinbutton", { name: "Количество" });
    expect(screen.queryByText("Требует проверки")).not.toBeInTheDocument();
    fireEvent.change(quantity, { target: { value: "6" } });
    expect(screen.getByText("Требует проверки")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Добавить в корзину\. Недостаточно товара на складе/ })).toBeDisabled();
    fireEvent.change(quantity, { target: { value: "5" } });
    expect(screen.queryByText("Требует проверки")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить в корзину" })).toBeEnabled();
    expect(initial.lines[0]).toMatchObject({ state: "requires_review", stateLabel: "Требует проверки", canConvert: false });
  });

  it("keeps row warning presentation separate from final-cart stock admission", () => {
    const initial = reviewRequiredDetail();
    initial.lines[0].existingCartQuantity = 4;
    render(<PurchasingListEditor initial={initial} />);
    expect(screen.queryByText("Требует проверки")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Добавить в корзину\. Недостаточно товара на складе/ })).toBeDisabled();
  });

  it("disables the row action when final quantity exceeds known stock and exposes the reason", () => {
    const initial = detail();
    initial.lines[0].existingCartQuantity = 4;
    render(<PurchasingListEditor initial={initial} />);
    const action = screen.getByRole("button", { name: /Добавить в корзину\. Недостаточно товара на складе/ });
    expect(action).toBeDisabled();
    expect(screen.getByRole("tooltip", { name: /Недостаточно товара на складе/ })).toBeInTheDocument();
  });

  it("keeps archived lists immutable and removes conversion controls", () => {
    render(<PurchasingListEditor initial={{ ...detail(), archivedAt: "2026-07-20T12:00:00Z" }} />);
    expect(screen.queryByRole("textbox", { name: "Название" })).not.toBeInTheDocument();
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

  it.each([false, true])("keeps the default editor quiet and notes absent (favorites=%s)", (favorites) => {
    const { container } = render(<PurchasingListEditor initial={{ ...detail(), isSystemFavorites: favorites, canManage: !favorites }} />);
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    if (favorites) expect(screen.getAllByText("Избранное")).toHaveLength(1);
    expect(screen.queryByText(/Системный список|коммерческих витрин/)).not.toBeInTheDocument();
    expect(screen.queryByText("Примечание")).not.toBeInTheDocument();
    expect(container.querySelector('[data-selection-toolbar]')).toBeNull();
    expect(container.querySelector('[data-list-settings]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Сохранить изменения" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Описание" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves historical notes verbatim while editing quantities (favorites=%s)", async (favorites) => {
    const initial = detail();
    initial.lines[0].note = "Historical note — do not erase";
    initial.isSystemFavorites = favorites;
    initial.canManage = !favorites;
    render(<PurchasingListEditor initial={initial} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество" }), { target: { value: "3" } });
    expect(screen.getAllByRole("button", { name: "Сохранить изменения" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    expect(actions.updatePurchasingListItemsAction).toHaveBeenCalledExactlyOnceWith(initial.id, initial.revision, [{ itemId: initial.lines[0].id, quantity: 3, position: 1, note: "Historical note — do not erase" }]);
    expect(initial.lines[0].quantity).toBe(2);
    expect(actions.updatePurchasingListMetadataAction).not.toHaveBeenCalled();
  });

  it("derives dirty state from quantity and order, and clears on reverting edits", async () => {
    const initial = detail();
    initial.lines.push({ ...initial.lines[0], id: "line-2", productName: "Second product", position: 2 });
    const { container } = render(<PurchasingListEditor initial={initial} />);
    const input = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(input, { target: { value: "4" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить изменения" })).toBeEnabled());
    fireEvent.change(input, { target: { value: "2" } });
    expect(screen.queryByRole("button", { name: "Сохранить изменения" })).toBeNull();
    await userEvent.click(screen.getAllByRole("button", { name: "Переместить вниз" })[0]);
    expect(container.querySelector('[data-product-row]')).toHaveTextContent("Second product");
    expect(screen.getAllByRole("button", { name: "Сохранить изменения" })).toHaveLength(1);
    await userEvent.click(screen.getAllByRole("button", { name: "Переместить вниз" })[0]);
    expect(screen.queryByRole("button", { name: "Сохранить изменения" })).toBeNull();
  });

  it("shows selection actions only for a nonzero selection without duplicating commerce actions", async () => {
    const { container } = render(<PurchasingListEditor initial={detail()} />);
    expect(screen.queryByRole("button", { name: "Удалить выбранное" })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox"));
    const toolbar = container.querySelector('[data-selection-toolbar]') as HTMLElement;
    expect(toolbar).toHaveTextContent("Выбрано: 1");
    expect(within(toolbar).getByRole("button", { name: "Добавить в подборку" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Создать КП" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "В корзину" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Снять выбор" }));
    expect(container.querySelector('[data-selection-toolbar]')).toBeNull();
  });

  it("preserves full-list and selected Cart payloads and rotates idempotency keys after success", async () => {
    const initial = detail();
    render(<PurchasingListEditor initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    const first = vi.mocked(actions.addPurchasingListToCartAction).mock.calls[0][0];
    expect(first).toEqual({ listId: initial.id, requestKey: expect.any(String) });
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    const second = vi.mocked(actions.addPurchasingListToCartAction).mock.calls[1][0];
    expect(second).toEqual({ listId: initial.id, requestKey: expect.any(String), selections: [{ itemId: initial.lines[0].id }] });
    expect(second.requestKey).not.toBe(first.requestKey);
    expect(actions.updatePurchasingListItemsAction).not.toHaveBeenCalled();
  });

  it("preserves full-list and selected Estimate payloads and destination", async () => {
    const initial = detail();
    render(<PurchasingListEditor initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: "Создать КП" }));
    expect(actions.createEstimateFromPurchasingListAction).toHaveBeenLastCalledWith({ listId: initial.id, name: `Смета — ${initial.name}`, requestKey: expect.any(String) });
    expect(push).toHaveBeenCalledWith("/cabinet/estimates/estimate-1");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Создать КП" }));
    expect(actions.createEstimateFromPurchasingListAction).toHaveBeenLastCalledWith({ listId: initial.id, name: `Смета — ${initial.name}`, requestKey: expect.any(String), selections: [{ itemId: initial.lines[0].id }] });
  });

  it("retains dirty quantities and the same Cart retry key after failure", async () => {
    vi.mocked(actions.addPurchasingListToCartAction).mockResolvedValueOnce({ success: false, data: null, message: "Failure", errorCode: "UNKNOWN" } as never);
    render(<PurchasingListEditor initial={detail()} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("spinbutton")).toHaveValue(3);
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить изменения" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    const calls = vi.mocked(actions.addPurchasingListToCartAction).mock.calls;
    expect(calls[0][0].requestKey).toBe(calls[1][0].requestKey);
  });

  it("preserves retail fallback and unknown stock without inventing partner values", () => {
    const initial = detail();
    initial.lines[0].currentPartnerPrice = null;
    initial.lines[0].availableStock = null;
    render(<PurchasingListEditor initial={initial} />);
    expect(screen.getByText("Розничная цена")).toBeInTheDocument();
    expect(screen.getByText("1 000 MDL")).toBeInTheDocument();
    expect(screen.getByText("Уточняется")).toBeInTheDocument();
    expect(screen.queryByText("$10.00")).toBeNull();
  });

  it("keeps metadata collapsed and preserves description/access in the existing update contract", async () => {
    const initial = { ...detail(), description: "Keep this description", visibility: "company" as const };
    const { container } = render(<PurchasingListEditor initial={initial} />);
    expect(screen.getByText("Для компании")).toBeInTheDocument();
    await userEvent.click(container.querySelector("summary")!);
    await userEvent.click(screen.getByRole("button", { name: "Переименовать" }));
    expect(screen.getByRole("textbox", { name: "Описание" })).toHaveValue("Keep this description");
    expect(screen.getByRole("combobox", { name: "Доступ" })).toHaveValue("company");
    fireEvent.change(screen.getByRole("textbox", { name: "Название" }), { target: { value: "Renamed" } });
    await userEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(actions.updatePurchasingListMetadataAction).toHaveBeenCalledExactlyOnceWith(initial.id, initial.revision, { name: "Renamed", description: "Keep this description", visibility: "company" });
    expect(actions.updatePurchasingListItemsAction).not.toHaveBeenCalled();
  });

  it("keeps duplication and archive in one keyboard-accessible overflow group", async () => {
    const { container } = render(<PurchasingListEditor initial={detail()} />);
    expect(container.querySelectorAll("details")).toHaveLength(1);
    await userEvent.click(container.querySelector("summary")!);
    expect(screen.getByRole("button", { name: "Переименовать" }).querySelector(".lucide-pencil")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Сохранить как новый" }).querySelector(".lucide-copy")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Архивировать" }).querySelector(".lucide-archive")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Сохранить как новый" }));
    expect(actions.duplicatePurchasingListAction).toHaveBeenCalledExactlyOnceWith(detail().id);
    expect(push).toHaveBeenCalledWith("/cabinet/purchasing-lists/copy-1");
    await userEvent.click(screen.getByRole("button", { name: "Архивировать" }));
    expect(actions.setPurchasingListArchivedAction).toHaveBeenCalledExactlyOnceWith(detail().id, 1, true);
  });

  it.each(["ru", "ro"] as const)("uses canonical copy/icons and one row geometry contract in %s", (locale) => {
    const { container } = render(<PartnerLocaleProvider locale={locale}><PurchasingListEditor initial={detail()} /></PartnerLocaleProvider>);
    const row = container.querySelector('[data-product-row]')!;
    expect(row).toHaveClass("xl:grid-cols-[44px_52px_minmax(0,1fr)_112px_136px_120px_132px]");
    expect(row.querySelector('[data-row-image]')).toHaveClass("size-[52px]");
    expect(row.querySelector('input[type="checkbox"]')?.parentElement).toHaveClass("size-11");
    expect(screen.getByRole("spinbutton")).toHaveClass("h-11");
    for (const button of container.querySelectorAll("[data-row-actions] button")) {
      expect(button).toHaveClass("size-11");
      if (button.hasAttribute("data-row-cart-action")) {
        expect(button).toHaveAttribute("aria-describedby");
      } else {
        expect(button.getAttribute("title")).toBe(button.getAttribute("aria-label"));
      }
    }
    expect(screen.getByRole("button", { name: locale === "ru" ? "Добавить в корзину" : "Adaugă în coș" }).querySelector(".lucide-shopping-cart")).not.toBeNull();
    expect(screen.getByRole("button", { name: locale === "ru" ? "В корзину" : "În coș" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: locale === "ru" ? "Создать КП" : "Creează ofertă" }).querySelector(".lucide-calculator")).not.toBeNull();
    expect(screen.getByRole("link", { name: locale === "ru" ? "Использовать комплект" : "Folosește setul" })).toHaveAttribute("href", expect.stringContaining("/cabinet/quick-order?kit="));
    expect(screen.queryByText(/Примечание|Notă|Системный список|Listă de sistem/)).toBeNull();
  });
});

function detail(): PurchasingListDetailDto { return { id: "33333333-3333-4333-8333-333333333333", companyId: "company-1", name: "Install kit", description: null, visibility: "private", createdBy: "user-1", updatedBy: "user-1", revision: 1, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z", archivedAt: null, ownerName: "Partner", canManage: true, lines: [{ id: "44444444-4444-4444-8444-444444444444", listId: "33333333-3333-4333-8333-333333333333", productId: "55555555-5555-4555-8555-555555555555", quantity: 2, position: 1, note: null, sourceType: "manual", sourceReferenceId: null, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z", sku: "400691", productName: "Very long camera product name that must wrap on mobile layouts", slug: "camera", imageUrl: null, currentPartnerPrice: "$10.00", currentPartnerPriceAmount: 10, currentPartnerCurrencyCode: "USD", currentRetailPrice: "1 000 MDL", currentRetailPriceAmount: 1000, currentRetailCurrencyCode: "MDL", availableStock: 5, existingCartQuantity: 0, canAddToCart: true, cartAdmissionBlocker: null, expectedArrivalDate: "2026-07-25", expectedArrivalQuantity: 10, state: "available", stateLabel: "Доступно", canConvert: true }] }; }

function reviewRequiredDetail(): PurchasingListDetailDto {
  const initial = detail();
  initial.lines[0].state = "requires_review";
  initial.lines[0].stateLabel = "Требует проверки";
  initial.lines[0].canConvert = false;
  return initial;
}
