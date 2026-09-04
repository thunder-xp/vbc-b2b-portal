import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkEstimateCommercialStateAction, removeEstimateLineAction, saveEstimateCommercialAction } from "../../actions/estimate.actions";
import type { EstimateDetailDto } from "../../services";
import type { EstimateWorkflowDto } from "../../types";
import { EstimateCommercialEditor } from "../EstimateCommercialEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../actions/estimate.actions", () => ({
  addEstimateCustomLineAction: vi.fn(),
  addEstimateProductsAction: vi.fn(),
  addEstimateServiceAction: vi.fn(),
  addEstimateServicesAction: vi.fn(),
  addEstimateSectionAction: vi.fn(),
  checkEstimateCommercialStateAction: vi.fn(),
  removeEstimateLineAction: vi.fn(),
  removeEstimateLinesAction: vi.fn(),
  saveEstimateCommercialAction: vi.fn(),
  searchEstimateProductsAction: vi.fn(),
}));

const detail: EstimateDetailDto = {
  id: "estimate-1", estimateNumber: "KP-2026-000001", name: "CCTV", customerName: "Customer", projectName: "Site",
  currencyCode: "USD", currencyRate: 1, currencyRateEffectiveDate: "2026-07-16", validityDays: 14,
  globalDiscountPercent: 0, vatMode: "none", vatRatePercent: 0, status: "draft", revision: 3,
  updatedAt: "2026-07-16T10:00:00Z", total: "$100.00",
  totals: { subtotal: 100, lineDiscountTotal: 0, sectionDiscountTotal: 0, globalDiscountAmount: 0, chargesTotal: 0, vatAmount: 0, totalExcludingVat: 100, finalTotal: 100, grossProfit: 20, overallMarginPercent: 20 },
  hasIncompletePricing: false, itemCount: 1,
  sections: [
    { id: "11111111-1111-1111-1111-111111111111", name: "Оборудование", systemKey: "equipment", sortOrder: 0, showSubtotal: true, discountPercent: 0, subtotal: 100, discountAmount: 0, total: 100 },
    { id: "11111111-1111-1111-1111-111111111112", name: "Монтажные материалы", systemKey: "installation_materials", sortOrder: 1, showSubtotal: true, discountPercent: 0, subtotal: 0, discountAmount: 0, total: 0 },
    { id: "11111111-1111-1111-1111-111111111113", name: "Монтажные работы", systemKey: "installation_works", sortOrder: 2, showSubtotal: true, discountPercent: 0, subtotal: 0, discountAmount: 0, total: 0 },
    { id: "11111111-1111-1111-1111-111111111114", name: "Пусконаладочные работы", systemKey: "commissioning_works", sortOrder: 3, showSubtotal: true, discountPercent: 0, subtotal: 0, discountAmount: 0, total: 0 },
  ],
  lines: [{
    id: "22222222-2222-2222-2222-222222222222", sectionId: "11111111-1111-1111-1111-111111111111", lineType: "product", productId: "product-1", position: 1, sku: "400691", description: "Camera", quantity: 1,
    unit: "pcs", unitLabel: "шт.", sourcePrice: "$80.00", sourceCurrencyCode: "USD", sourceSnapshotAt: "2026-07-16T09:00:00Z",
    pricingMode: "direct", pricingInputValue: 100, internalCostUnitPrice: null, convertedCostUnitPrice: 80, exchangeRate: 1,
    exchangeRateEffectiveDate: "2026-07-16", lineDiscountPercent: 0, markupPercent: 25, marginPercent: 20,
    sellingUnitPrice: 100, formattedSellingUnitPrice: "$100.00", lineTotal: "$100.00", imageUrl: null,
  }], charges: [],
};
const workflow: EstimateWorkflowDto = { estimateId: "estimate-1", estimateStatus: "draft", lifecycleStatus: "draft", acceptedVersionId: null, emailDeliveryAvailable: false, versions: [], readiness: { ready: true, checks: [] } };

function renderEditor() {
  return render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD", "MDL"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={detail} services={[]} workflow={workflow} />);
}

describe("EstimateCommercialEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the compact workspace header and keeps detailed settings collapsed", () => {
    renderEditor();
    expect(screen.getByRole("heading", { name: "CCTV" })).toBeInTheDocument();
    expect(screen.queryByText(/Версия 3/)).not.toBeInTheDocument();
    expect(screen.getByTitle("Заказчик: Customer")).toBeInTheDocument();
    expect(screen.getByTitle("Проект: Site")).toBeInTheDocument();
    expect(screen.getByText("Параметры сметы").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сохранить и выйти" })).not.toBeInTheDocument();
  });

  it("opens a contextual picker from its governed section", async () => {
    const user = userEvent.setup();
    renderEditor();
    const addEquipment = screen.getByRole("button", { name: "Добавить оборудование" });
    expect(screen.queryByLabelText("SKU, модель или название")).not.toBeInTheDocument();
    await user.click(addEquipment);
    expect(screen.getByLabelText("SKU, модель или название")).toBeInTheDocument();
    expect(screen.getByText("Добавление: Оборудование")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Каталог Novotech" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("combobox", { name: "Фильтр разделов" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Раздел назначения" })).not.toBeInTheDocument();
  });

  it("keeps clean totals, preview, and proposal preparation together", () => {
    renderEditor();
    const summary = screen.getByRole("heading", { name: "Коммерческий расчёт" });
    const proposal = screen.getByRole("heading", { name: "Коммерческое предложение" });
    expect(summary.compareDocumentPosition(proposal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    const sidebar = summary.closest("aside");
    expect(sidebar).not.toBeNull();
    expect(within(sidebar!).queryByText("НДС")).not.toBeInTheDocument();
    expect(within(sidebar!).queryByText("КП / ИТОГ")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Предпросмотр КП" })).toHaveAttribute("href", "/cabinet/estimates/estimate-1/preview");
    expect(screen.getByRole("button", { name: "Подготовить КП" })).toBeEnabled();
  });

  it("renders thumbnails only for product lines before their description", () => {
    const serviceLine = { ...detail.lines[0], id: "service-line", lineType: "service" as const, productId: null, sku: null, imageUrl: null, description: "Installation" };
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={{ ...detail, lines: [detail.lines[0], serviceLine], itemCount: 2 }} services={[]} workflow={workflow} />);
    expect(screen.getAllByTestId("product-line-thumbnail")).toHaveLength(1);
    const productInput = screen.getByDisplayValue("Camera");
    expect(screen.getByTestId("product-line-thumbnail").compareDocumentPosition(productInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByDisplayValue("Installation")).toBeInTheDocument();
  });

  it("updates the line draft locally and sends one batch only on Save", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: true, data: { ...detail, revision: 4 }, message: "Saved", errorCode: null });
    renderEditor();

    const quantity = screen.getByRole("spinbutton", { name: "Кол-во" });
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.tab();
    expect(saveEstimateCommercialAction).not.toHaveBeenCalled();
    expect(screen.getByText("Не сохранено")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(saveEstimateCommercialAction).toHaveBeenCalledTimes(1);
    expect(saveEstimateCommercialAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({
      expectedRevision: 3,
      lines: [expect.objectContaining({ quantity: 2 })],
    }));
    expect(screen.queryByText("Не сохранено")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить оборудование" })).toBeEnabled();
  });

  it("enables Save as soon as a numeric value changes", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: true, data: { ...detail, revision: 4 }, message: "Saved", errorCode: null });
    renderEditor();

    const price = screen.getByRole("spinbutton", { name: "Цена клиенту" });
    await user.clear(price);
    await user.type(price, "101");
    const save = screen.getByRole("button", { name: "Сохранить" });
    expect(save).toBeEnabled();
    await user.click(save);

    expect(saveEstimateCommercialAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({
      lines: [expect.objectContaining({ pricingInputValue: 101 })],
    }));
  });

  it("shows the monetary total of line, section, and global discounts once", () => {
    const discounted = {
      ...detail,
      globalDiscountPercent: 10,
      sections: detail.sections.map((section, index) => index === 0 ? { ...section, discountPercent: 10 } : section),
      lines: [{ ...detail.lines[0], quantity: 1, pricingInputValue: 100, sellingUnitPrice: 100, lineDiscountPercent: 10 }],
    };
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={discounted} services={[]} workflow={workflow} />);

    const summary = screen.getByRole("heading", { name: "Коммерческий расчёт" }).closest("aside");
    expect(summary).not.toBeNull();
    expect(within(summary!).getByText(/27,10/)).toBeInTheDocument();
  });

  it("exposes every governed action in a viewport-bounded mobile sheet", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByTestId("estimate-mobile-actions-trigger"));

    const sheet = screen.getByTestId("estimate-mobile-action-sheet");
    expect(sheet).toHaveAttribute("role", "dialog");
    expect(sheet).toHaveStyle({
      maxHeight: "calc(100dvh - max(1rem, env(safe-area-inset-top)))",
      paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
    });
    for (const name of [
      "Отменить изменения",
      "Проверить розничные цены",
      "Предпросмотр КП",
      "PDF и отправка",
      "Дублировать смету",
      "Архивировать",
    ]) {
      expect(within(sheet).getByRole(/Предпросмотр|PDF/.test(name) ? "link" : "button", { name })).toBeInTheDocument();
    }
    await user.tab({ shift: true });
    expect(within(sheet).getByRole("button", { name: "Архивировать" })).toHaveFocus();
    await user.click(within(sheet).getByRole("button", { name: "Закрыть действия" }));
    expect(screen.queryByTestId("estimate-mobile-action-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("estimate-mobile-actions-trigger")).toHaveFocus();
  });

  it("renders exactly the four governed sections without structural controls", () => {
    renderEditor();
    for (const name of ["Оборудование", "Монтажные материалы", "Монтажные работы", "Пусконаладочные работы"]) {
      expect(screen.getByRole("heading", { name, level: 3 })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Добавить раздел" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Название раздела")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить вверх" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Выбрать все позиции раздела/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Свернуть раздел:/ })).toHaveLength(4);
  });

  it("projects legacy mixed sections into the same four-section presentation", () => {
    const legacySection = { ...detail.sections[0], id: "legacy-section", name: "Оборудование и услуги", systemKey: null, sortOrder: 9 };
    const legacyProduct = { ...detail.lines[0], id: "legacy-product", sectionId: legacySection.id };
    const legacyService = { ...detail.lines[0], id: "legacy-service", sectionId: legacySection.id, lineType: "service" as const, productId: null, description: "Монтаж" };
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={{ ...detail, sections: [...detail.sections, legacySection], lines: [legacyProduct, legacyService] }} services={[]} workflow={workflow} />);

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(screen.queryByRole("heading", { name: "Оборудование и услуги" })).not.toBeInTheDocument();
    expect(screen.queryByText("Исторический раздел")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Camera").closest("section")).toHaveAttribute("data-section-key", "equipment");
    expect(screen.getByDisplayValue("Монтаж").closest("section")).toHaveAttribute("data-section-key", "installation_works");
  });

  it("uses one aligned row layout and removes commercial-detail expansion blocks", () => {
    const manualLine = { ...detail.lines[0], id: "manual-line", lineType: "custom" as const, productId: null, sku: null, imageUrl: null, description: "Кабельные работы" };
    const externalLine = { ...manualLine, id: "external-line", lineType: "external" as const, description: "Внешняя камера" };
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={{ ...detail, lines: [detail.lines[0], manualLine, externalLine] }} services={[]} workflow={workflow} />);

    expect(screen.getByText("Ручная позиция")).toBeInTheDocument();
    expect(screen.getByText("Внешняя позиция")).toBeInTheDocument();
    expect(screen.queryByText("Коммерческие детали")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Режим" })).not.toBeInTheDocument();
    const rows = screen.getAllByTestId("estimate-line-row");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.firstElementChild).toHaveAttribute("data-testid", "estimate-line-grid");
      expect(row.firstElementChild).toHaveClass("xl:grid-cols-[3rem_minmax(9rem,1fr)_4.25rem_4.5rem_5.25rem_4.75rem_5.5rem_2.75rem]");
    }
    expect(screen.getByTestId("estimate-line-header")).toHaveTextContent("ФотоПозицияКол-воЕд.Цена продажиСкидка, %Итого");
  });

  it("shows currency conversion confirmation and preserves manual-price choice", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.selectOptions(screen.getByRole("combobox", { name: "Валюта" }), "MDL");
    expect(screen.getByRole("dialog")).toHaveTextContent("USD → MDL");
    expect(screen.getByRole("dialog")).toHaveTextContent("17.5");
    await user.click(screen.getByRole("button", { name: "Сохранить ручные цены" }));
    expect(screen.getByRole("combobox", { name: "Валюта" })).toHaveValue("MDL");
  });

  it("does not expose bulk selection or row movement controls", () => {
    renderEditor();
    expect(screen.queryByRole("checkbox", { name: "Выбрать позицию 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Применить наценку" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить вверх" })).not.toBeInTheDocument();
  });

  it("removes one row through the existing governed action", async () => {
    const user = userEvent.setup();
    vi.mocked(removeEstimateLineAction).mockResolvedValue({ success: true, data: { ...detail, lines: [], revision: 4 }, message: "Removed", errorCode: null });
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Удалить позицию" }));

    expect(removeEstimateLineAction).toHaveBeenCalledTimes(1);
    expect(removeEstimateLineAction).toHaveBeenCalledWith("estimate-1", "22222222-2222-2222-2222-222222222222", 3);
  });

  it("exposes and executes the editor save shortcut without a global listener", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: true, data: { ...detail, revision: 4 }, message: "Saved", errorCode: null });
    renderEditor();
    expect(screen.getByRole("button", { name: "Сохранить" })).toHaveAttribute("aria-keyshortcuts", "Control+S Meta+S");

    const quantity = screen.getByRole("spinbutton", { name: "Кол-во" });
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.tab();
    await user.keyboard("{Control>}s{/Control}");
    expect(saveEstimateCommercialAction).toHaveBeenCalledTimes(1);
  });

  it("renders a 120-line estimate without the removed top-level search", () => {
    const lines = Array.from({ length: 120 }, (_, index) => ({
      ...detail.lines[0],
      id: `line-${index}`,
      position: index + 1,
      description: `Position ${index + 1}`,
    }));
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={{ ...detail, lines, itemCount: lines.length }} services={[]} workflow={workflow} />);

    expect(screen.queryByPlaceholderText("Поиск по позициям")).not.toBeInTheDocument();
    expect(screen.getByTitle("Position 119")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Position 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Position 120")).toBeInTheDocument();
    expect(saveEstimateCommercialAction).not.toHaveBeenCalled();
  });

  it("compares current commercial data without mutating until selected prices are applied", async () => {
    const user = userEvent.setup();
    vi.mocked(checkEstimateCommercialStateAction).mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Текущие цены и наличие проверены.",
      data: {
        checkedAt: "2026-07-29T08:00:00Z",
        lines: [{ lineId: detail.lines[0].id, sku: "400691", description: "Camera", oldPrice: 100, currentPrice: 95, currencyCode: "USD", priceChanged: true, currentStock: "В наличии: 8 шт.", currentArrival: null }],
      },
    });
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Проверить розничные цены" }));
    expect(checkEstimateCommercialStateAction).toHaveBeenCalledWith("estimate-1");
    expect(screen.getByText("В наличии: 8 шт.")).toBeInTheDocument();
    expect(saveEstimateCommercialAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Применить выбранные цены" }));
    expect(screen.getByText(/Сохраните смету/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });
});
