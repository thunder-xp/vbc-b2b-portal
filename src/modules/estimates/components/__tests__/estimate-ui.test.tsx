import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EstimateDetailDto, EstimateProductPickerDto } from "../../services";
import { createEstimateAction, createFinalCustomerAction, searchEstimateProductsAction, searchFinalCustomersAction } from "../../actions/estimate.actions";
import { EstimateCreateForm } from "../EstimateCreateForm";
import { EstimateEditor } from "../EstimateEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../actions/estimate.actions", () => ({
  createEstimateAction: vi.fn(),
  createFinalCustomerAction: vi.fn(),
  searchFinalCustomersAction: vi.fn(),
  addEstimateCustomLineAction: vi.fn(),
  addEstimateProductsAction: vi.fn(),
  addEstimateServiceAction: vi.fn(),
  addEstimateServicesAction: vi.fn(),
  archiveEstimateAction: vi.fn(),
  removeEstimateLineAction: vi.fn(),
  saveEstimateAction: vi.fn(),
  searchEstimateProductsAction: vi.fn(),
  updateEstimateLineAction: vi.fn(),
}));
vi.mock("../../actions/demand.actions", () => ({ setExternalDemandAction: vi.fn() }));

const detail: EstimateDetailDto = {
  id: "estimate-1",
  estimateNumber: "KP-2026-000001",
  name: "Warehouse CCTV",
  customerName: "Customer",
  projectName: "Warehouse",
  currencyCode: "USD",
  currencyRate: 1,
  currencyRateEffectiveDate: "2026-07-16",
  validityDays: 14,
  globalDiscountPercent: 0,
  vatMode: "none",
  vatRatePercent: 0,
  status: "draft",
  revision: 3,
  updatedAt: "2026-07-16T10:00:00Z",
  total: "$100.00",
  totals: { subtotal: 100, lineDiscountTotal: 0, sectionDiscountTotal: 0, globalDiscountAmount: 0, chargesTotal: 0, vatAmount: 0, totalExcludingVat: 100, finalTotal: 100, grossProfit: 0, overallMarginPercent: 0 },
  hasIncompletePricing: false,
  itemCount: 1,
  lines: [{
    id: "item-1",
    sectionId: "section-1",
    lineType: "product",
    productId: "product-1",
    position: 1,
    sku: "400691",
    description: "Camera",
    quantity: 2,
    unit: "pcs",
    unitLabel: "шт.",
    sourcePrice: "$50.00",
    sourceCurrencyCode: "USD",
    sourceSnapshotAt: "2026-07-16T09:00:00Z",
    pricingMode: "direct",
    pricingInputValue: 50,
    internalCostUnitPrice: null,
    convertedCostUnitPrice: 50,
    exchangeRate: 1,
    exchangeRateEffectiveDate: "2026-07-16",
    lineDiscountPercent: 0,
    markupPercent: 0,
    marginPercent: 0,
    sellingUnitPrice: 50,
    formattedSellingUnitPrice: "$50.00",
    lineTotal: "$100.00",
  }],
  sections: [{ id: "section-1", name: "Equipment", sortOrder: 0, showSubtotal: true, discountPercent: 0, subtotal: 100, discountAmount: 0, total: 100 }],
  charges: [],
};

const products: EstimateProductPickerDto = {
  products: [{ id: "product-1", name: "Camera", sku: "400691", imageUrl: null, categoryName: "CCTV", brandName: "Dahua", partnerPrice: "$50.00", retailPrice: null, stock: "В наличии", expectedArrival: null }],
  categories: [{ id: "category-1", name: "CCTV" }],
  brands: [{ id: "brand-1", name: "Dahua" }],
};

describe("estimate UI", () => {
  it("shows only the customer and optional title before additional settings", async () => {
    const user = userEvent.setup();
    render(<EstimateCreateForm currencies={["MDL", "USD"]} />);
    expect(screen.getByRole("textbox", { name: "Название (необязательно)" })).toBeInTheDocument();
    const additional = screen.getByText("Дополнительно").closest("details");
    expect(additional).not.toHaveAttribute("open");
    expect(within(additional!).getByRole("combobox", { name: "Валюта" })).toHaveValue("MDL");
    expect(within(additional!).getByRole("spinbutton", { name: /Срок, дней/ })).toHaveValue(14);
    await user.click(screen.getByText("Дополнительно"));
    expect(screen.getByRole("combobox", { name: "Валюта" })).toHaveValue("MDL");
    expect(screen.getByRole("combobox", { name: /Заказчик/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать и добавить товары" })).toBeDisabled();
  });

  it("does not preload final customers and enables creation after a bounded selection", async () => {
    const user = userEvent.setup();
    vi.mocked(searchFinalCustomersAction).mockResolvedValue({ success: true, errorCode: null, message: "Заказчики найдены.", data: [{
      id: "11111111-1111-1111-1111-111111111111", companyId: "company-1", displayName: "NADZOR SRL",
      customerType: "company", fiscalCode: "0200046888", locality: "Chișinău", industry: null, industryCode: null, primaryEmail: null,
      revision: 1, archivedAt: null, createdAt: "2026-08-08T10:00:00Z", updatedAt: "2026-08-08T10:00:00Z",
    }] });
    render(<EstimateCreateForm currencies={["USD"]} />);
    expect(searchFinalCustomersAction).not.toHaveBeenCalled();
    await user.type(screen.getByRole("combobox", { name: /Заказчик/ }), "NA");
    await waitFor(() => expect(searchFinalCustomersAction).toHaveBeenCalledWith("NA"));
    await user.click(await screen.findByRole("option", { name: /NADZOR SRL/ }));
    expect(screen.getByRole("button", { name: "Создать и добавить товары" })).toBeEnabled();
  });

  it("uses the existing safe defaults and derives the omitted title", async () => {
    const user = userEvent.setup();
    vi.mocked(createEstimateAction).mockResolvedValue({ success: true, errorCode: null, message: "Created", data: { id: "estimate-2" } });
    vi.mocked(searchFinalCustomersAction).mockResolvedValue({ success: true, errorCode: null, message: "Found", data: [{
      id: "11111111-1111-1111-1111-111111111111", companyId: "company-1", displayName: "NADZOR SRL",
      customerType: "company", fiscalCode: null, locality: null, industry: null, industryCode: null, primaryEmail: null,
      revision: 1, archivedAt: null, createdAt: "2026-08-08T10:00:00Z", updatedAt: "2026-08-08T10:00:00Z",
    }] });
    render(<EstimateCreateForm currencies={["USD", "MDL"]} />);
    await user.type(screen.getByRole("combobox", { name: /Заказчик/ }), "NA");
    await user.click(await screen.findByRole("option", { name: /NADZOR SRL/ }));
    await user.click(screen.getByRole("button", { name: "Создать и добавить товары" }));
    await waitFor(() => expect(createEstimateAction).toHaveBeenCalledWith(expect.objectContaining({
      name: "Без названия",
      finalCustomerId: "11111111-1111-1111-1111-111111111111",
      currencyCode: "USD",
      validityDays: 14,
    })));
  });

  it("keeps inline customer creation to one required field until requested", async () => {
    const user = userEvent.setup();
    render(<EstimateCreateForm currencies={["USD"]} />);
    await user.click(screen.getByRole("button", { name: "Создать заказчика" }));
    expect(screen.getByRole("textbox", { name: "Название / имя" })).toBeRequired();
    const customerType = document.querySelector<HTMLSelectElement>('select[name="newCustomerType"]');
    const customerAdditional = customerType?.closest("details");
    expect(customerAdditional).not.toHaveAttribute("open");
    expect(customerType).toHaveValue("company");
    expect(screen.getByRole("button", { name: "Создать и выбрать" })).toBeInTheDocument();
    await user.click(within(customerAdditional!).getByText("Дополнительно"));
    expect(screen.getByRole("combobox", { name: "Тип" })).toHaveValue("company");
    expect(screen.getByRole("textbox", { name: "IDNO" })).toBeInTheDocument();
  });

  it("preserves inline customer input when contextual validation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(createFinalCustomerAction).mockResolvedValue({ success: false, data: null, errorCode: "VALIDATION_ERROR", message: "Проверьте IDNO." });
    render(<EstimateCreateForm currencies={["USD"]} />);
    await user.click(screen.getByRole("button", { name: "Создать заказчика" }));
    const customerType = document.querySelector<HTMLSelectElement>('select[name="newCustomerType"]');
    const customerAdditional = customerType?.closest("details");
    await user.click(within(customerAdditional!).getByText("Дополнительно"));
    await user.type(screen.getByRole("textbox", { name: "Название / имя" }), "Customer SRL");
    await user.type(screen.getByRole("textbox", { name: "IDNO" }), "1234567890123");
    await user.click(screen.getByRole("button", { name: "Создать и выбрать" }));

    expect(await screen.findByText("Проверьте IDNO.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Название / имя" })).toHaveValue("Customer SRL");
    expect(screen.getByRole("textbox", { name: "IDNO" })).toHaveValue("1234567890123");
  });

  it("keeps an empty customer autocomplete quiet and leaves creation available", async () => {
    const user = userEvent.setup();
    vi.mocked(searchFinalCustomersAction).mockResolvedValue({ success: true, errorCode: null, message: "Заказчики не найдены.", data: [] });
    render(<EstimateCreateForm currencies={["USD"]} />);
    await user.type(screen.getByRole("combobox", { name: /Заказчик/ }), "ZZ");
    await waitFor(() => expect(searchFinalCustomersAction).toHaveBeenCalledWith("ZZ"));
    expect(screen.queryByText("Совпадений нет.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать заказчика" })).toBeInTheDocument();
  });

  it("renders the editor shell, server totals, and three line sources", async () => {
    const user = userEvent.setup();
    vi.mocked(searchEstimateProductsAction).mockResolvedValue({ success: true, data: products, errorCode: null, message: "Товары загружены." });
    render(<EstimateEditor initialEstimate={detail} services={[{ id: "service-1", name: "Монтаж", description: null, defaultUnit: "pcs", unitLabel: "шт.", defaultCost: null, defaultSellingPrice: null, vatApplicable: true, category: "general" }]} />);

    expect(screen.getByText("KP-2026-000001")).toBeInTheDocument();
    expect(screen.getAllByText("$100.00")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Предпросмотр КП" })).toHaveAttribute("href", "/cabinet/estimates/estimate-1/preview");
    expect(screen.queryByRole("button", { name: "PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Товары" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Товары" }).compareDocumentPosition(screen.getByRole("heading", { name: "Позиции сметы" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(searchEstimateProductsAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Найти" }));
    expect(await screen.findByText("SKU 400691")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Работы и услуги" }));
    expect(screen.getByRole("combobox", { name: "Работа / услуга" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Своя позиция" }));
    expect(screen.getByRole("textbox", { name: "Описание" })).toBeInTheDocument();
  });

  it("makes archived estimates read-only", () => {
    render(<EstimateEditor initialEstimate={{
      ...detail,
      status: "archived",
      lines: [{ ...detail.lines[0], lineType: "external", productId: null, externalNomenclatureId: "external-1" }],
    }} services={[]} />);
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(screen.queryByRole("tab", { name: "Товары" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "В архив" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Запросить предложение Novotech" })).not.toBeInTheDocument();
  });
});
