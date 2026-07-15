import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EstimateDetailDto, EstimateProductPickerDto } from "../../services";
import { searchEstimateProductsAction } from "../../actions";
import { EstimateCreateForm } from "../EstimateCreateForm";
import { EstimateEditor } from "../EstimateEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../actions", () => ({
  createEstimateAction: vi.fn(),
  addEstimateCustomLineAction: vi.fn(),
  addEstimateProductsAction: vi.fn(),
  addEstimateServiceAction: vi.fn(),
  archiveEstimateAction: vi.fn(),
  removeEstimateLineAction: vi.fn(),
  saveEstimateAction: vi.fn(),
  searchEstimateProductsAction: vi.fn(),
  updateEstimateLineAction: vi.fn(),
}));

const detail: EstimateDetailDto = {
  id: "estimate-1",
  estimateNumber: "KP-2026-000001",
  name: "Warehouse CCTV",
  customerName: "Customer",
  projectName: "Warehouse",
  currencyCode: "USD",
  validityDays: 14,
  status: "draft",
  revision: 3,
  updatedAt: "2026-07-16T10:00:00Z",
  total: "$100.00",
  hasIncompletePricing: false,
  itemCount: 1,
  lines: [{
    id: "item-1",
    lineType: "product",
    productId: "product-1",
    position: 1,
    sku: "400691",
    description: "Camera",
    quantity: 2,
    unit: "pcs",
    unitLabel: "шт.",
    sourcePrice: "$50.00",
    sellingUnitPrice: 50,
    formattedSellingUnitPrice: "$50.00",
    lineTotal: "$100.00",
  }],
};

const products: EstimateProductPickerDto = {
  products: [{ id: "product-1", name: "Camera", sku: "400691", imageUrl: null, categoryName: "CCTV", brandName: "Dahua", partnerPrice: "$50.00", stock: "В наличии", expectedArrival: null }],
  categories: [{ id: "category-1", name: "CCTV" }],
  brands: [{ id: "brand-1", name: "Dahua" }],
};

describe("estimate UI", () => {
  it("keeps estimate creation compact and limited to published currencies", () => {
    render(<EstimateCreateForm currencies={["MDL", "USD"]} />);
    expect(screen.getByRole("textbox", { name: "Название сметы" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Валюта" })).toHaveValue("MDL");
    expect(screen.getByRole("button", { name: "Создать смету" })).toBeEnabled();
  });

  it("renders the editor shell, server totals, and three line sources", async () => {
    const user = userEvent.setup();
    vi.mocked(searchEstimateProductsAction).mockResolvedValue({ success: true, data: products, errorCode: null, message: "Товары загружены." });
    render(<EstimateEditor initialEstimate={detail} services={[{ id: "service-1", name: "Монтаж", description: null, defaultUnit: "pcs", unitLabel: "шт." }]} />);

    expect(screen.getByText("KP-2026-000001")).toBeInTheDocument();
    expect(screen.getAllByText("$100.00")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Предпросмотр" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "PDF" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Товары" })).toHaveAttribute("aria-selected", "true");
    expect(searchEstimateProductsAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Найти" }));
    expect(await screen.findByText("SKU 400691")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Работы и услуги" }));
    expect(screen.getByRole("combobox", { name: "Работа / услуга" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Своя позиция" }));
    expect(screen.getByRole("textbox", { name: "Описание" })).toBeInTheDocument();
  });

  it("makes archived estimates read-only", () => {
    render(<EstimateEditor initialEstimate={{ ...detail, status: "archived" }} services={[]} />);
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(screen.queryByRole("tab", { name: "Товары" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "В архив" })).not.toBeInTheDocument();
  });
});
