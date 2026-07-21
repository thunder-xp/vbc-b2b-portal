import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { removeEstimateLinesAction, saveEstimateCommercialAction } from "../../actions/estimate.actions";
import type { EstimateDetailDto } from "../../services";
import { EstimateCommercialEditor } from "../EstimateCommercialEditor";

vi.mock("../../actions/estimate.actions", () => ({
  addEstimateCustomLineAction: vi.fn(),
  addEstimateProductsAction: vi.fn(),
  addEstimateServiceAction: vi.fn(),
  addEstimateServicesAction: vi.fn(),
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
  sections: [{ id: "11111111-1111-1111-1111-111111111111", name: "Оборудование", sortOrder: 0, showSubtotal: true, discountPercent: 0, subtotal: 100, discountAmount: 0, total: 100 }],
  lines: [{
    id: "22222222-2222-2222-2222-222222222222", sectionId: "11111111-1111-1111-1111-111111111111", lineType: "product", productId: "product-1", position: 1, sku: "400691", description: "Camera", quantity: 1,
    unit: "pcs", unitLabel: "шт.", sourcePrice: "$80.00", sourceCurrencyCode: "USD", sourceSnapshotAt: "2026-07-16T09:00:00Z",
    pricingMode: "direct", pricingInputValue: 100, internalCostUnitPrice: null, convertedCostUnitPrice: 80, exchangeRate: 1,
    exchangeRateEffectiveDate: "2026-07-16", lineDiscountPercent: 0, markupPercent: 25, marginPercent: 20,
    sellingUnitPrice: 100, formattedSellingUnitPrice: "$100.00", lineTotal: "$100.00", imageUrl: null,
  }], charges: [],
};

function renderEditor() {
  return render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD", "MDL"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={detail} services={[]} />);
}

describe("EstimateCommercialEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders thumbnails only for product lines before their description", () => {
    const serviceLine = { ...detail.lines[0], id: "service-line", lineType: "service" as const, productId: null, sku: null, imageUrl: null, description: "Installation" };
    render(<EstimateCommercialEditor commercialOptions={{ currencies: ["USD"], usdMdlRate: 17.5, rateEffectiveDate: "2026-07-16" }} initialEstimate={{ ...detail, lines: [detail.lines[0], serviceLine], itemCount: 2 }} services={[]} />);
    expect(screen.getAllByTestId("product-line-thumbnail")).toHaveLength(1);
    const productInput = screen.getByDisplayValue("Camera");
    expect(screen.getByTestId("product-line-thumbnail").compareDocumentPosition(productInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByDisplayValue("Installation")).toBeInTheDocument();
  });

  it("updates commercial preview locally and sends one batch only on Save", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: true, data: { ...detail, revision: 4 }, message: "Saved", errorCode: null });
    renderEditor();

    await user.selectOptions(screen.getByRole("combobox", { name: "Режим" }), "markup");
    expect(saveEstimateCommercialAction).not.toHaveBeenCalled();
    expect(screen.getByText("Есть несохраненные изменения")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(saveEstimateCommercialAction).toHaveBeenCalledTimes(1);
    expect(saveEstimateCommercialAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({
      expectedRevision: 3,
      lines: [expect.objectContaining({ pricingMode: "markup" })],
    }));
  });

  it("creates, renames, collapses, and reorders sections without a request", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Раздел" }));
    expect(screen.getByDisplayValue("Новый раздел")).toBeInTheDocument();
    await user.clear(screen.getByDisplayValue("Новый раздел"));
    await user.type(screen.getAllByLabelText("Название раздела")[1], "Монтаж");
    await user.click(screen.getAllByRole("button", { name: "Переместить вверх" }).at(-1)!);
    expect(screen.getAllByLabelText("Название раздела")[0]).toHaveValue("Монтаж");
    await user.click(screen.getAllByRole("button", { name: "Свернуть раздел" })[0]);
    expect(saveEstimateCommercialAction).not.toHaveBeenCalled();
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

  it("previews a bulk markup and persists it in the existing atomic save", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: true, data: { ...detail, revision: 4 }, message: "Saved", errorCode: null });
    renderEditor();

    await user.click(screen.getByRole("checkbox", { name: "Выбрать позицию 1" }));
    await user.clear(screen.getByRole("spinbutton", { name: "Наценка для выбранных" }));
    await user.type(screen.getByRole("spinbutton", { name: "Наценка для выбранных" }), "30");
    await user.click(screen.getByRole("button", { name: "Применить наценку" }));

    expect(saveEstimateCommercialAction).not.toHaveBeenCalled();
    expect(screen.getByText("Наценка применена: 1.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(saveEstimateCommercialAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({
      lines: [expect.objectContaining({ pricingInputValue: 30, pricingMode: "markup" })],
    }));
  });

  it("removes selected lines through one batch action", async () => {
    const user = userEvent.setup();
    vi.mocked(removeEstimateLinesAction).mockResolvedValue({ success: true, data: { ...detail, lines: [], revision: 4 }, message: "Removed", errorCode: null });
    renderEditor();

    await user.click(screen.getByRole("checkbox", { name: "Выбрать позицию 1" }));
    await user.click(screen.getByRole("button", { name: "Удалить" }));

    expect(removeEstimateLinesAction).toHaveBeenCalledTimes(1);
    expect(removeEstimateLinesAction).toHaveBeenCalledWith("estimate-1", ["22222222-2222-2222-2222-222222222222"], 3);
  });

  it("exposes and executes the editor save shortcut without a global listener", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEstimateCommercialAction).mockResolvedValue({ success: true, data: { ...detail, revision: 4 }, message: "Saved", errorCode: null });
    renderEditor();
    expect(screen.getByRole("button", { name: /Сохранить/ })).toHaveAttribute("aria-keyshortcuts", "Control+S Meta+S");

    await user.selectOptions(screen.getByRole("combobox", { name: "Режим" }), "markup");
    await user.keyboard("{Control>}s{/Control}");
    expect(saveEstimateCommercialAction).toHaveBeenCalledTimes(1);
  });
});
