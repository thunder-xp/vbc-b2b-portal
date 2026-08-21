import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductAvailabilityBlock } from "../ProductAvailabilityBlock";

describe("ProductAvailabilityBlock", () => {
  it.each([
    ["in_stock", { exactAvailableQuantity: 12 }, "В наличии: 12 шт."],
    ["low_stock", { exactAvailableQuantity: 2 }, "Осталось: 2 шт."],
    ["expected", { expectedArrival: { expectedDate: "2026-08-01" } }, "Ожидается к поступлению\n1 августа 2026 г."],
    ["out_of_stock", {}, "Нет в наличии"],
  ] as const)("renders the %s state as text in a stable zone", (status, details, label) => {
    const { container } = render(<ProductAvailabilityBlock stock={{ status, ...details } as never} />);
    expect(container.firstElementChild).toHaveTextContent(label.replace("\n", " "));
    expect(container.firstElementChild).toHaveClass("h-full", "border-l-2");
  });

  it("preserves predictable wrapping for an expected arrival", () => {
    render(<ProductAvailabilityBlock stock={{ status: "expected", expectedArrival: { expectedDate: "2026-08-01" } } as never} />);
    expect(screen.getByText(/Ожидается к поступлению/)).toHaveClass("line-clamp-2", "whitespace-pre-line");
  });

  it("uses the safe missing-stock state without fake data", () => {
    render(<ProductAvailabilityBlock />);
    expect(screen.getByText("Наличие уточняется")).toBeInTheDocument();
  });
});
