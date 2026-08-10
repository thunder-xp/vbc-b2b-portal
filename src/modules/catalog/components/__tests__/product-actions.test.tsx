import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductComparisonAction } from "../ProductComparisonAction";
import { ProductSpecificationAction } from "../ProductSpecificationAction";

const listEstimates = vi.fn();
const addItem = vi.fn();

vi.mock("../../../estimates/actions/estimate.actions", () => ({
  listEditableEstimatesForProductAction: (...args: unknown[]) => listEstimates(...args),
  addCatalogProductToEstimateAction: (...args: unknown[]) => addItem(...args),
}));
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({
  recordBehaviorInteraction: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href} {...props}>{children}</a>,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("product secondary actions", () => {
  it("stores one user-company comparison set and enforces the four-product limit", () => {
    const { rerender } = render(
      <ProductComparisonAction
        categoryId="category-1"
        companyId="company-1"
        productId="product-1"
        userId="user-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "В сравнение" }));
    expect(screen.getByRole("button", { name: "В сравнении" })).toHaveClass("bg-emerald-50");
    fireEvent.click(screen.getByRole("button", { name: "В сравнении" }));
    fireEvent.click(screen.getByRole("button", { name: "В сравнение" }));
    expect(JSON.parse(
      localStorage.getItem("novotech-catalog-compare:company-1:user-1") ?? "[]",
    )).toEqual(["product-1"]);

    localStorage.setItem(
      "novotech-catalog-compare:company-1:user-1",
      JSON.stringify(["a", "b", "c", "d"]),
    );
    rerender(
      <ProductComparisonAction
        categoryId="category-2"
        companyId="company-1"
        productId="product-5"
        userId="user-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "В сравнение" }));
    expect(JSON.parse(
      localStorage.getItem("novotech-catalog-compare:company-1:user-1") ?? "[]",
    )).toHaveLength(4);
    expect(screen.getByText("Можно сравнить не более 4 товаров.")).toBeInTheDocument();
  });

  it("adds a canonical product and quantity to a selected editable estimate", async () => {
    listEstimates.mockResolvedValue({
      success: true,
      data: [{ id: "estimate-1", name: "Site", estimateNumber: "KP-1", revision: 3 }],
    });
    addItem.mockResolvedValue({ success: true, message: "ok", data: null });
    render(<ProductSpecificationAction productId="product-1" />);
    fireEvent.click(screen.getByRole("button", { name: "В смету" }));
    expect(screen.getByRole("button", { name: "В смету" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "В смету" })).toHaveClass("bg-emerald-50");
    await screen.findByRole("option", { name: "KP-1 · Site" });
    fireEvent.change(screen.getByLabelText("Количество"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ estimateId: "estimate-1", productId: "product-1", quantity: 3, requestKey: expect.any(String) })),
    );
  });
});
