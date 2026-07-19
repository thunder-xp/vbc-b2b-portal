import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../actions/reorder.actions", () => ({ addQuickReorderToCartAction: vi.fn() }));

import { QuickReorderPanel } from "../QuickReorderPanel";
import type { QuickReorderPreviewDto, QuickReorderPreviewLineDto, QuickReorderLineStatus } from "../../services";

describe("QuickReorderPanel", () => {
  it("supports selection, clearing, and quantity editing without horizontal table markup", async () => {
    const user = userEvent.setup();
    const { container } = render(<QuickReorderPanel preview={preview()} requestKey="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" />);

    expect(screen.getByText("Купить снова из № NSUU-001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    expect(screen.getByText(/Выбрано:/)).toHaveTextContent("2 поз., 5 ед.");
    expect(screen.getByText("Наличие: 5 ед.")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Снять выбор" }));
    expect(screen.getByText(/Выбрано:/)).toHaveTextContent("0 поз., 0 ед.");

    await user.click(screen.getByRole("button", { name: "Только доступные" }));
    expect(screen.getByText(/Выбрано:/)).toHaveTextContent("1 поз., 3 ед.");

    const quantity = screen.getByLabelText("Количество", { selector: "#quantity-line-1" });
    await user.clear(quantity);
    await user.type(quantity, "4");
    expect(screen.getByText(/Выбрано:/)).toHaveTextContent("1 поз., 4 ед.");
  });

  it("keeps unavailable products unselected and exposes a safe replacement search", () => {
    const value = preview();
    value.lines[1] = { ...value.lines[1], status: "unavailable", statusLabel: "Товар больше недоступен", canSelect: false, selectedByDefault: false };
    render(<QuickReorderPanel preview={value} requestKey="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" />);

    expect(screen.getByRole("checkbox", { name: "Выбрать Recorder" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Найти замену" })).toHaveAttribute("href", "/cabinet/catalog?category=category-1");
  });
});

function preview(): QuickReorderPreviewDto {
  return {
    orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    orderLabel: "№ NSUU-001",
    lines: [
      previewLine("line-1", "Camera", 3, "available", true),
      previewLine("line-2", "Recorder", 2, "temporarily_unavailable", true),
    ],
    commercialSummary: { unchanged: 0, increased: 2, decreased: 0, unavailable: 0 },
  };
}

function previewLine(lineId: string, productName: string, quantity: number, status: QuickReorderLineStatus, selected: boolean): QuickReorderPreviewLineDto {
  return {
    lineId, productId: `product-${lineId}`, imageUrl: null, sku: "SKU-1", productName,
    historicalQuantity: quantity,
    historicalUnitPrice: { amount: 8, currencyCode: "USD", formatted: "$8.00" },
    currentUnitPrice: { amount: 10, currencyCode: "USD", formatted: "$10.00" },
    priceDifference: { kind: "increased", label: "Цена выросла", absoluteDifference: 2, percentageDifference: 25, formattedAbsoluteDifference: "+$2.00", formattedPercentageDifference: "+25%" },
    availableStock: status === "available" ? 5 : 0, expectedArrival: null,
    status, statusLabel: status === "available" ? "Доступно" : "Товар временно отсутствует",
    canSelect: selected, selectedByDefault: selected,
    replacementHref: "/cabinet/catalog?category=category-1",
  };
}
