import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkEstimateCommercialStateAction, removeEstimateLineAction, saveEstimateCommercialAction } from "../../actions/estimate.actions";
import type { EstimateDetailDto } from "../../services";
import type { EstimateWorkflowDto } from "../../types";
import { PartnerLocaleProvider } from "../../../partner-locale";
import { EstimateCommercialEditor } from "../EstimateCommercialEditor";
import { notifyEstimatePdfReady } from "../EstimatePdfShareAction";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../../behavior-analytics/components", () => ({ recordBehaviorInteraction: vi.fn() }));
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
    id: "22222222-2222-2222-2222-222222222222", sectionId: "11111111-1111-1111-1111-111111111111", lineType: "product", productId: "product-1", productName: "Camera", productSlug: "camera", position: 1, sku: "400691", description: "Camera", quantity: 1,
    unit: "pcs", unitLabel: "шт.", sourcePrice: "$80.00", sourceCurrencyCode: "USD", sourceSnapshotAt: "2026-07-16T09:00:00Z",
    pricingMode: "direct", pricingInputValue: 100, internalCostUnitPrice: null, convertedCostUnitPrice: 80, exchangeRate: 1,
    exchangeRateEffectiveDate: "2026-07-16", lineDiscountPercent: 0, markupPercent: 25, marginPercent: 20,
    sellingUnitPrice: 100, formattedSellingUnitPrice: "$100.00", lineTotal: "$100.00", imageUrl: null,
  }], charges: [],
};
const workflow: EstimateWorkflowDto = { estimateId: "estimate-1", estimateStatus: "draft", lifecycleStatus: "draft", acceptedVersionId: null, emailDeliveryAvailable: false, guidedState: { state: "draft", primaryAction: null, secondaryActions: ["duplicate"], resumeCartId: null }, draftReadiness: { state: "prepare_proposal", primaryAction: "prepare_proposal", target: null, linePosition: null, ready: true, checks: [] }, permissions: { canManage: true, canSend: true, canConvert: true, canManageOrders: true }, versions: [], readiness: { ready: true, checks: [] } };
const currentPdfWorkflow: EstimateWorkflowDto = {
  ...workflow,
  versions: [{
    id: "version-1", versionNumber: 1, estimateRevision: 3, label: "KP-2026-000001 / версия 1",
    status: "prepared", statusLabel: "Подготовлено", total: "100,00 USD", currencyCode: "USD", note: null,
    createdAt: "2026-09-05T10:00:00Z", createdByName: "Manager", sentAt: null, acceptedAt: null,
    rejectedAt: null, pdfDocumentId: "document-1", pdfStatus: "ready", deliveries: [],
  }],
};

function renderEditor() {
  return render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD", "MDL"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={detail} services={[]} workflow={workflow} />);
}

describe("EstimateCommercialEditor", () => {
  it("edits a section label locally and preserves its stable identity on explicit Save", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: true, data: { ...detail, revision: 4, sections: detail.sections.map((section, index) => index === 0 ? { ...section, name: "Камеры объекта" } : section) }, message: "Saved", errorCode: null });
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Переименовать: Оборудование" }));
    const name = screen.getByRole("textbox", { name: "Название раздела" });
    await user.clear(name); await user.type(name, "Камеры объекта{Enter}");
    expect(saveEstimateCommercialAction).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Камеры объекта" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(saveEstimateCommercialAction).toHaveBeenCalledWith(detail.id, expect.objectContaining({ sections: expect.arrayContaining([expect.objectContaining({ id: detail.sections[0].id, systemKey: "equipment", name: "Камеры объекта", sortOrder: 0, discountPercent: 0, showSubtotal: true })]) }));
  });
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "canShare");
  });

  it("renders the compact workspace header and keeps detailed settings collapsed", () => {
    renderEditor();
    expect(screen.getByRole("heading", { name: "CCTV" })).toBeInTheDocument();
    expect(screen.queryByText(/Версия 3/)).not.toBeInTheDocument();
    expect(screen.getByTitle("Заказчик: Customer")).toBeInTheDocument();
    expect(screen.getByTitle("Проект: Site")).toBeInTheDocument();
    expect(screen.getByText("Параметры сметы").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Подготовить КП" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Сохранить и выйти" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
    expect(screen.getByTestId("estimate-customer-field")).not.toHaveClass("sm:col-span-2");
    expect(within(screen.getByTestId("estimate-customer-field")).getByText("Заказчик")).toBeInTheDocument();
  });

  it("shows one add-product action for an empty draft without auto-opening the picker", async () => {
    const user = userEvent.setup();
    render(<EstimateCommercialEditor
      commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }}
      initialEstimate={{ ...detail, customerName: null, lines: [], itemCount: 0, total: "$0.00", totals: { ...detail.totals, subtotal: 0, totalExcludingVat: 0, finalTotal: 0 } }}
      services={[]}
      workflow={{ ...workflow, customer: null }}
    />);

    expect(screen.getByTestId("estimate-guided-workflow")).toHaveAttribute("data-draft-readiness-state", "add_product");
    expect(screen.getByTestId("estimate-primary-next-action").querySelectorAll("button, a")).toHaveLength(1);
    expect(screen.queryByLabelText("SKU, модель или название")).not.toBeInTheDocument();
    await user.click(within(screen.getByTestId("estimate-primary-next-action")).getByRole("button"));
    expect(screen.getByLabelText("Код, модель или название")).toBeInTheDocument();
  });

  it("does not make customer or email an early proposal-readiness blocker", () => {
    render(<EstimateCommercialEditor
      commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }}
      initialEstimate={{ ...detail, customerName: null }}
      services={[]}
      workflow={{ ...workflow, customer: null }}
    />);
    expect(screen.getByTestId("estimate-guided-workflow")).toHaveAttribute("data-draft-readiness-state", "prepare_proposal");
    expect(screen.getByRole("button", { name: "Подготовить КП" })).toBeEnabled();
  });

  it("focuses the exact invalid quantity before allowing a save", async () => {
    const user = userEvent.setup();
    renderEditor();
    const quantity = screen.getByRole("spinbutton", { name: "Кол-во" });
    await user.clear(quantity);
    await user.type(quantity, "0");
    expect(screen.getByTestId("estimate-guided-workflow")).toHaveAttribute("data-draft-readiness-state", "fix_quantity");
    await user.click(within(screen.getByTestId("estimate-primary-next-action")).getByRole("button"));
    await waitFor(() => expect(quantity).toHaveFocus());
  });

  it("opens a contextual picker from its governed section", async () => {
    const user = userEvent.setup();
    renderEditor();
    const addEquipment = screen.getByRole("button", { name: "Добавить оборудование" });
    expect(screen.queryByLabelText("SKU, модель или название")).not.toBeInTheDocument();
    await user.click(addEquipment);
    await waitFor(() => expect(screen.getByLabelText("Код, модель или название")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Выбрать несколько" }));
    expect(screen.getByText("Добавление: Оборудование")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Каталог Novotech" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("combobox", { name: "Фильтр разделов" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Раздел назначения" })).not.toBeInTheDocument();
    const filters = screen.getByText("Фильтры").closest("details");
    expect(filters).not.toHaveAttribute("open");
    expect(within(filters!).getByRole("combobox", { name: "Категория" })).toBeInTheDocument();
    expect(within(filters!).getByRole("combobox", { name: "Бренд" })).toBeInTheDocument();
    await user.click(screen.getByText("Фильтры"));
    expect(screen.getByRole("combobox", { name: "Категория" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Бренд" })).toBeInTheDocument();
  });

  it("keeps one proposal-preparation action above clean totals", () => {
    renderEditor();
    const summary = screen.getByRole("heading", { name: "Коммерческий расчёт" });
    const proposal = screen.getByRole("heading", { name: "Подготовьте КП" });
    expect(summary.compareDocumentPosition(proposal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    const sidebar = summary.closest("aside");
    expect(sidebar).not.toBeNull();
    expect(within(sidebar!).queryByText("НДС")).not.toBeInTheDocument();
    expect(within(sidebar!).queryByText("КП / ИТОГ")).not.toBeInTheDocument();
    expect(within(sidebar!).getByRole("link", { name: "Предпросмотр КП" })).toBeInTheDocument();
    const previewAction = within(sidebar!).getByRole("link", { name: "Предпросмотр КП" });
    const prepareAction = within(sidebar!).getByRole("button", { name: "Подготовить КП" });
    expect(previewAction.compareDocumentPosition(prepareAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(sidebar!).queryByRole("button", { name: "Создать заказ" })).not.toBeInTheDocument();
    expect(prepareAction).toBeEnabled();
  });

  it("renders thumbnails only for product lines before their description", () => {
    const serviceLine = { ...detail.lines[0], id: "service-line", lineType: "service" as const, productId: null, sku: null, imageUrl: null, description: "Installation" };
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={{ ...detail, lines: [detail.lines[0], serviceLine], itemCount: 2 }} services={[]} workflow={workflow} />);
    expect(screen.getAllByTestId("product-line-thumbnail")).toHaveLength(1);
    const productDescription = screen.getByText("Camera");
    expect(screen.getByTestId("product-line-thumbnail").compareDocumentPosition(productDescription) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByDisplayValue("Installation")).toBeInTheDocument();
  });

  it("keeps catalog-known product fields behind line details while quantity and customer price stay primary", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: true, data: { ...detail, revision: 4 }, message: "Saved", errorCode: null });
    renderEditor();

    expect(screen.getByText("Camera")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Кол-во" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Цена клиенту" })).toBeInTheDocument();
    const lineDetails = screen.getByTestId("estimate-line-advanced");
    expect(within(lineDetails).queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Описание, единица и скидка"));
    expect(within(lineDetails).getByRole("dialog", { name: "Описание, единица и скидка" })).toBeInTheDocument();
    expect(within(lineDetails).getByRole("textbox", { name: "Описание" })).toHaveValue("Camera");
    expect(within(lineDetails).getByRole("combobox", { name: "Ед." })).toHaveValue("pcs");
    expect(within(lineDetails).getByRole("spinbutton", { name: "Скидка, %" })).toHaveValue(0);
    const description = screen.getByRole("textbox", { name: "Описание" });
    await user.clear(description);
    await user.type(description, "Camera set");
    await user.selectOptions(screen.getByRole("combobox", { name: "Ед." }), "set");
    const discount = screen.getByRole("spinbutton", { name: "Скидка, %" });
    await user.clear(discount);
    await user.type(discount, "5");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(saveEstimateCommercialAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({
      lines: [expect.objectContaining({ description: "Camera set", unit: "set", lineDiscountPercent: 5 })],
    }));
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
    expect(screen.getByRole("status")).toHaveTextContent("Не сохранено");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(saveEstimateCommercialAction).toHaveBeenCalledTimes(1);
    expect(saveEstimateCommercialAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({
      expectedRevision: 3,
      lines: [expect.objectContaining({ quantity: 2 })],
    }));
    expect(screen.getByRole("status")).not.toHaveTextContent("Не сохранено");
    await waitFor(() => expect(screen.getByRole("button", { name: "Добавить оборудование" })).toBeEnabled());
  });

  it("preserves entered data and the same retryable blocker when save fails", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: false, data: null, message: "Сохранение временно недоступно.", errorCode: "UNKNOWN" });
    renderEditor();
    const quantity = screen.getByRole("spinbutton", { name: "Кол-во" });
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(quantity).toHaveValue(2);
    expect(screen.getByText("Сохранение временно недоступно.")).toBeInTheDocument();
    expect(screen.getByTestId("estimate-guided-workflow")).toHaveAttribute("data-draft-readiness-state", "save_changes");
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled());
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
      "Дублировать смету",
      "Архивировать",
    ]) {
      expect(within(sheet).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(sheet).queryByRole("link", { name: "Предпросмотр КП" })).not.toBeInTheDocument();
    await user.tab({ shift: true });
    expect(within(sheet).getByRole("button", { name: "Архивировать" })).toHaveFocus();
    await user.click(within(sheet).getByRole("button", { name: "Закрыть действия" }));
    expect(screen.queryByTestId("estimate-mobile-action-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("estimate-mobile-actions-trigger")).toHaveFocus();
  });

  it("uses a compact expandable description, governed stock tone, and authoritative pricing helper", async () => {
    const user = userEvent.setup();
    render(<EstimateCommercialEditor
      commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }}
      initialEstimate={{ ...detail, lines: [{ ...detail.lines[0], description: "Compact customer-facing product summary.", currentStockStatus: "out_of_stock", currentAvailableQuantity: 0 }] }}
      services={[]}
      workflow={workflow}
    />);
    const productLink = screen.getByRole("link", { name: "Camera" });
    expect(productLink).toHaveAttribute("href", "/cabinet/catalog/camera");
    expect(productLink).toHaveAttribute("target", "_blank");
    const description = screen.getByText("Compact customer-facing product summary.");
    expect(description).toHaveClass("line-clamp-1");
    await user.click(screen.getByRole("button", { name: "Подробнее" }));
    expect(description).not.toHaveClass("line-clamp-1");
    expect(screen.getByRole("button", { name: "Скрыть описание" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Ваша цена:")).toBeInTheDocument();
    expect(screen.queryByText(/Ваша цена Novotech/)).not.toBeInTheDocument();
    expect(screen.getByText("$80.00")).toHaveClass("text-emerald-700");
    expect(screen.getByText("Наценка: 25%")).toBeInTheDocument();
    expect(screen.getByTestId("estimate-line-stock")).toHaveClass("text-rose-950");
    expect(screen.getByTestId("estimate-line-stock")).not.toHaveTextContent("уточняется");
  });

  it("keeps one canonical Preview control and surfaces actual stock warnings in the summary", () => {
    render(<EstimateCommercialEditor
      commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }}
      initialEstimate={{ ...detail, lines: [{ ...detail.lines[0], currentStockStatus: "out_of_stock", currentAvailableQuantity: 0 }] }}
      services={[]}
      workflow={workflow}
    />);
    expect(screen.getAllByRole("link", { name: "Предпросмотр КП" })).toHaveLength(1);
    expect(screen.getByTestId("estimate-summary-warnings")).toHaveTextContent("Недостаточный остаток: 1");
    expect(screen.getByRole("button", { name: "Подготовить КП" })).toBeEnabled();
    expect(screen.getByText("✓ Сохранено")).toHaveAttribute("role", "status");
  });

  it("switches from direct selling price to authoritative markup without changing commercial truth", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Описание, единица и скидка" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Способ расчёта цены" }), "markup");
    const markup = screen.getByRole("spinbutton", { name: "Наценка %" });
    expect(markup).toHaveValue(25);
    expect(await screen.findByText(/Продажа:/)).toHaveTextContent(/100,00/);
    expect(screen.getByText("● Не сохранено")).toHaveAttribute("role", "status");
  });

  it("does not generate a broken PDP link for an unavailable or external line", () => {
    const unavailable = { ...detail.lines[0], productUnavailable: true };
    const external = { ...detail.lines[0], id: "external", lineType: "external" as const, productId: null, productSlug: null, description: "External item" };
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={{ ...detail, lines: [unavailable, external] }} services={[]} workflow={workflow} />);
    expect(screen.queryByRole("link", { name: "Camera" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "External item" })).not.toBeInTheDocument();
  });

  it("closes the desktop Actions menu on outside click and Escape", async () => {
    const user = userEvent.setup();
    renderEditor();
    const trigger = screen.getByTestId("estimate-desktop-actions-trigger");

    await user.click(trigger);
    expect(screen.getByTestId("estimate-desktop-actions-menu")).toBeInTheDocument();
    await user.click(screen.getByRole("heading", { name: "CCTV" }));
    expect(screen.queryByTestId("estimate-desktop-actions-menu")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("estimate-desktop-actions-menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("uses one controlled row menu with toggle, outside-click, Escape, and destructive styling", async () => {
    const user = userEvent.setup();
    renderEditor();
    const trigger = screen.getByRole("button", { name: "Описание, единица и скидка" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Описание, единица и скидка" })).toBeInTheDocument();
    const deleteAction = screen.getByRole("button", { name: "Удалить позицию" });
    expect(deleteAction).toHaveClass("text-red-700");
    expect(deleteAction.querySelector("svg")).toHaveClass("text-red-700");
    expect(screen.getByRole("dialog", { name: "Описание, единица и скидка" })).not.toHaveClass("text-red-700");

    await user.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Описание, единица и скидка" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("heading", { name: "CCTV" }));
    expect(screen.queryByRole("dialog", { name: "Описание, единица и скидка" })).not.toBeInTheDocument();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Описание, единица и скидка" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("uses the governed two-row parameter geometry with a wider customer field", () => {
    renderEditor();
    const primaryRow = screen.getByTestId("estimate-parameters-primary-row");
    const commercialRow = screen.getByTestId("estimate-parameters-commercial-row");
    expect(primaryRow).toHaveClass("xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]");
    expect(within(primaryRow).getByText("Название")).toBeInTheDocument();
    expect(within(primaryRow).getByText("Заказчик")).toBeInTheDocument();
    expect(within(primaryRow).getByText("Проект / объект")).toBeInTheDocument();
    expect(commercialRow).toHaveClass("xl:grid-cols-4");
    for (const label of ["НДС", "Скидка на всю смету, %", "Срок, дней", "Валюта"]) {
      expect(within(commercialRow).getByText(label)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId("estimate-customer-field")).getByRole("combobox")).toHaveClass("min-h-11");
  });

  it("keeps governed ready and template actions only inside Actions", async () => {
    const user = userEvent.setup();
    render(<EstimateCommercialEditor
      commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }}
      initialEstimate={detail}
      services={[]}
      workflow={{ ...workflow, guidedState: { ...workflow.guidedState, secondaryActions: ["duplicate", "save_template", "mark_ready"] } }}
    />);
    expect(screen.queryByText("Другие действия")).not.toBeInTheDocument();
    expect(screen.queryByText("PDF и отправка")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("estimate-desktop-actions-trigger"));
    const menu = screen.getByTestId("estimate-desktop-actions-menu");
    expect(within(menu).getByRole("button", { name: "Отметить как готово" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Сохранить как шаблон" })).toBeInTheDocument();
  });

  it("shows one-tap native Share only for the current saved PDF and removes it after an unsaved edit", async () => {
    const user = userEvent.setup();
    enableNativeShare();
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD", "MDL"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={detail} services={[]} workflow={currentPdfWorkflow} />);

    const actionBar = screen.getByTestId("estimate-mobile-action-bar");
    expect(await within(actionBar).findByRole("button", { name: "Поделиться" })).toBeInTheDocument();
    expect(actionBar.firstElementChild).toHaveClass("grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3rem]");

    const quantity = screen.getByRole("spinbutton", { name: "Кол-во" });
    await user.clear(quantity);
    await user.type(quantity, "2");
    await waitFor(() =>
      expect(within(actionBar).queryByRole("button", { name: "Поделиться" })).not.toBeInTheDocument(),
    );
    expect(within(actionBar).queryByRole("link", { name: "Скачать PDF" })).not.toBeInTheDocument();
  });

  it("does not silently expose a stale proposal and adopts a newly ready current PDF", async () => {
    enableNativeShare();
    const staleWorkflow: EstimateWorkflowDto = {
      ...currentPdfWorkflow,
      versions: [{ ...currentPdfWorkflow.versions[0]!, estimateRevision: 2 }],
    };
    const { unmount } = render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={detail} services={[]} workflow={staleWorkflow} />);
    expect(screen.queryByRole("button", { name: "Поделиться" })).not.toBeInTheDocument();
    unmount();

    const awaitingPdf: EstimateWorkflowDto = {
      ...currentPdfWorkflow,
      versions: [{ ...currentPdfWorkflow.versions[0]!, pdfDocumentId: null, pdfStatus: null }],
    };
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={detail} services={[]} workflow={awaitingPdf} />);
    expect(screen.queryByRole("button", { name: "Поделиться" })).not.toBeInTheDocument();
    act(() => notifyEstimatePdfReady({
      id: "document-2", companyId: "company-1", estimateId: "estimate-1", estimateRevision: 3,
      versionId: "version-1", templateId: null, generationFingerprint: "fingerprint", status: "ready",
      storageBucket: "estimate-proposals", storageKey: "company-1/document-2.pdf", pageCount: 1,
      fileSizeBytes: 5, checksumSha256: "checksum", safeError: null, createdAt: "2026-09-05T10:00:00Z",
    }));
    expect(await screen.findByRole("button", { name: "Поделиться" })).toBeInTheDocument();
  });

  it("uses the exact Romanian mobile Share label", async () => {
    enableNativeShare();
    render(
      <PartnerLocaleProvider locale="ro">
        <EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={detail} services={[]} workflow={currentPdfWorkflow} />
      </PartnerLocaleProvider>,
    );
    expect(await screen.findByRole("button", { name: "Distribuie" })).toBeInTheDocument();
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
    expect(screen.getByText("Camera").closest("section")).toHaveAttribute("data-section-key", "equipment");
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
      expect(row.firstElementChild).toHaveClass("xl:grid-cols-[3rem_minmax(0,1fr)_6rem_4.5rem_6.5rem_6rem_2.75rem]");
    }
    expect(screen.getByTestId("estimate-line-header")).toHaveTextContent("ФотоПозицияНаличиеКол-воЦена продажиИтого");
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

    await user.click(screen.getByRole("button", { name: "Описание, единица и скидка" }));
    await user.click(screen.getByRole("button", { name: "Удалить позицию" }));

    expect(removeEstimateLineAction).toHaveBeenCalledTimes(1);
    expect(removeEstimateLineAction).toHaveBeenCalledWith("estimate-1", "22222222-2222-2222-2222-222222222222", 3);
    expect(screen.queryByRole("dialog", { name: "Описание, единица и скидка" })).not.toBeInTheDocument();
  });

  it("exposes and executes the editor save shortcut without a global listener", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: true, data: { ...detail, revision: 4 }, message: "Saved", errorCode: null });
    renderEditor();

    const quantity = screen.getByRole("spinbutton", { name: "Кол-во" });
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.tab();
    expect(screen.getByRole("button", { name: "Сохранить" })).toHaveAttribute("aria-keyshortcuts", "Control+S Meta+S");
    await user.keyboard("{Control>}s{/Control}");
    expect(saveEstimateCommercialAction).toHaveBeenCalledTimes(1);
  });

  it("renders a 120-line estimate without the removed top-level search", async () => {
    const user = userEvent.setup();
    const lines = Array.from({ length: 120 }, (_, index) => ({
      ...detail.lines[0],
      id: `line-${index}`,
      position: index + 1,
      description: `Position ${index + 1}`,
    }));
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={{ ...detail, lines, itemCount: lines.length }} services={[]} workflow={workflow} />);

    expect(screen.queryByPlaceholderText("Поиск по позициям")).not.toBeInTheDocument();
    expect(screen.getByTitle("Position 119")).toBeInTheDocument();
    const lineMenus = screen.getAllByRole("button", { name: "Описание, единица и скидка" });
    await user.click(lineMenus[0]);
    expect(screen.getByDisplayValue("Position 1")).toBeInTheDocument();
    await user.click(lineMenus[119]);
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

    await user.click(screen.getByTestId("estimate-desktop-actions-trigger"));
    await user.click(within(screen.getByTestId("estimate-desktop-actions-menu")).getByRole("button", { name: "Проверить розничные цены" }));
    expect(checkEstimateCommercialStateAction).toHaveBeenCalledWith("estimate-1");
    expect(screen.getByText("В наличии: 8 шт.")).toBeInTheDocument();
    expect(saveEstimateCommercialAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Применить выбранные цены" }));
    expect(screen.getByText(/Сохраните смету/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });
});

function enableNativeShare() {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: vi.fn().mockReturnValue(true),
  });
}
