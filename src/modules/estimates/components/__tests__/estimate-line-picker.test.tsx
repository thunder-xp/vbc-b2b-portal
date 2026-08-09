import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addEstimateProductsAction,
  addEstimateServicesAction,
  searchEstimateProductsAction,
} from "../../actions/estimate.actions";
import type { EstimateDetailDto, EstimateProductPickerDto, EstimateServiceDto } from "../../services";
import { EstimateLinePicker } from "../EstimateLinePicker";

vi.mock("../../actions/estimate.actions", () => ({
  addEstimateCustomLineAction: vi.fn(),
  addEstimateProductsAction: vi.fn(),
  addEstimateServicesAction: vi.fn(),
  searchEstimateProductsAction: vi.fn(),
}));

const estimate = {
  id: "estimate-1",
  revision: 3,
  status: "draft",
} as EstimateDetailDto;
const products: EstimateProductPickerDto = {
  products: [
    { id: "product-1", name: "Camera Pro", sku: "400691", imageUrl: null, categoryName: "CCTV", brandName: "Dahua", partnerPrice: "$50.00", retailPrice: null, stock: "В наличии: 10", expectedArrival: null },
    { id: "product-2", name: "Recorder", sku: "400692", imageUrl: null, categoryName: "CCTV", brandName: "Dahua", partnerPrice: "$80.00", retailPrice: null, stock: "Под заказ", expectedArrival: "28.07.2026" },
  ],
  categories: [{ id: "category-1", name: "CCTV" }],
  brands: [{ id: "brand-1", name: "Dahua" }],
};
const services: EstimateServiceDto[] = [
  { id: "service-1", name: "Монтаж камеры", description: null, defaultUnit: "pcs", unitLabel: "шт.", defaultCost: 5, defaultSellingPrice: 10, vatApplicable: true, category: "Монтаж" },
  { id: "service-2", name: "Настройка системы", description: null, defaultUnit: "service", unitLabel: "услуга", defaultCost: 10, defaultSellingPrice: 25, vatApplicable: true, category: "Настройка" },
];

describe("EstimateLinePicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds multiple searched products with quantities through one mutation", async () => {
    const user = userEvent.setup();
    vi.mocked(searchEstimateProductsAction).mockResolvedValue({ success: true, data: products, message: "Загружено", errorCode: null });
    vi.mocked(addEstimateProductsAction).mockResolvedValue({ success: true, data: estimate, message: "Добавлено", errorCode: null });
    render(<EstimateLinePicker allowedModes={["product", "external"]} contextLabel="Монтажные материалы" disabled={false} estimate={estimate} mode="product" onModeChange={vi.fn()} onResult={vi.fn()} services={services} targetSectionId="section-2" />);

    await user.type(screen.getByLabelText("SKU, модель или название"), "camera");
    await user.click(screen.getByRole("button", { name: "Найти" }));
    expect(await screen.findByText("SKU 400691 · Dahua · CCTV")).toBeInTheDocument();
    expect(screen.getByText("Поступление 28.07.2026", { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Выбрать Camera Pro" }));
    await user.click(screen.getByRole("checkbox", { name: "Выбрать Recorder" }));
    await user.clear(screen.getByRole("spinbutton", { name: "Количество Recorder" }));
    await user.type(screen.getByRole("spinbutton", { name: "Количество Recorder" }), "3");
    await user.click(screen.getByRole("button", { name: "Добавить выбранные (2)" }));

    expect(addEstimateProductsAction).toHaveBeenCalledTimes(1);
    expect(addEstimateProductsAction).toHaveBeenCalledWith("estimate-1", 3, [
      { productId: "product-1", quantity: 1 },
      { productId: "product-2", quantity: 3 },
    ], expect.objectContaining({ targetSectionId: "section-2", requestKey: expect.any(String) }));
    expect(screen.queryByRole("combobox", { name: "Раздел назначения" })).not.toBeInTheDocument();
    expect(screen.getByText("Добавление: Монтажные материалы")).toBeInTheDocument();
  });

  it("adds multiple controlled services through one mutation", async () => {
    const user = userEvent.setup();
    vi.mocked(addEstimateServicesAction).mockResolvedValue({ success: true, data: estimate, message: "Добавлено", errorCode: null });
    render(<EstimateLinePicker allowedModes={["service"]} contextLabel="Монтажные работы" disabled={false} estimate={estimate} mode="service" onModeChange={vi.fn()} onResult={vi.fn()} services={services} targetSectionId="section-2" />);

    await user.click(screen.getByRole("checkbox", { name: "Выбрать Монтаж камеры" }));
    await user.click(screen.getByRole("checkbox", { name: "Выбрать Настройка системы" }));
    await user.click(screen.getByRole("button", { name: "Добавить выбранные (2)" }));

    expect(addEstimateServicesAction).toHaveBeenCalledTimes(1);
    expect(addEstimateServicesAction).toHaveBeenCalledWith("estimate-1", 3, [
      { serviceId: "service-1", quantity: 1, sellingUnitPrice: 10 },
      { serviceId: "service-2", quantity: 1, sellingUnitPrice: 25 },
    ], expect.objectContaining({ targetSectionId: "section-2", requestKey: expect.any(String) }));
  });
});
