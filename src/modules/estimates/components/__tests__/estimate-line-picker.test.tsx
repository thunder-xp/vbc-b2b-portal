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
    { id: "product-1", name: "Camera Pro", sku: "400691", imageUrl: null, categoryName: "CCTV", brandName: "Dahua", partnerPrice: "$50.00", stock: "В наличии: 10", expectedArrival: null },
    { id: "product-2", name: "Recorder", sku: "400692", imageUrl: null, categoryName: "CCTV", brandName: "Dahua", partnerPrice: "$80.00", stock: "Под заказ", expectedArrival: "28.07.2026" },
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
    render(<EstimateLinePicker disabled={false} estimate={estimate} onResult={vi.fn()} services={services} />);

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
    ]);
  });

  it("adds multiple controlled services through one mutation", async () => {
    const user = userEvent.setup();
    vi.mocked(addEstimateServicesAction).mockResolvedValue({ success: true, data: estimate, message: "Добавлено", errorCode: null });
    render(<EstimateLinePicker disabled={false} estimate={estimate} onResult={vi.fn()} services={services} />);

    await user.click(screen.getByRole("tab", { name: "Добавить работы и услуги" }));
    await user.click(screen.getByRole("checkbox", { name: "Выбрать Монтаж камеры" }));
    await user.click(screen.getByRole("checkbox", { name: "Выбрать Настройка системы" }));
    await user.click(screen.getByRole("button", { name: "Добавить выбранные (2)" }));

    expect(addEstimateServicesAction).toHaveBeenCalledTimes(1);
    expect(addEstimateServicesAction).toHaveBeenCalledWith("estimate-1", 3, [
      { serviceId: "service-1", quantity: 1, sellingUnitPrice: 10 },
      { serviceId: "service-2", quantity: 1, sellingUnitPrice: 25 },
    ]);
  });
});
