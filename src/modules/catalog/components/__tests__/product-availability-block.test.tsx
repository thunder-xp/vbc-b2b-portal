import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductAvailabilityBlock } from "../ProductAvailabilityBlock";

describe("ProductAvailabilityBlock", () => {
  it.each([
    ["in_stock", { exactAvailableQuantity: 12 }, "В наличии: 12 шт."],
    ["low_stock", { exactAvailableQuantity: 2 }, "Осталось: 2 шт."],
    ["expected", { expectedArrival: { expectedDate: "2026-08-01" } }, "Ожидается к поступлению · 1 августа 2026 г."],
    ["out_of_stock", {}, "Нет в наличии"],
  ] as const)("renders the %s state as text in a stable zone", (status, details, label) => {
    const { container } = render(<ProductAvailabilityBlock stock={{ status, ...details } as never} />);
    expect(container.firstElementChild).toHaveTextContent(label.replace("\n", " "));
    expect(container.firstElementChild).toHaveClass("h-full");
    expect(container.firstElementChild).not.toHaveClass("border-l-2");
  });

  it("keeps an expected arrival on one compact line", () => {
    render(<ProductAvailabilityBlock stock={{ status: "expected", expectedArrival: { expectedDate: "2026-08-01" } } as never} />);
    expect(screen.getByText(/Ожидается к поступлению/)).toHaveClass("truncate", "whitespace-nowrap");
    expect(screen.getByText(/Ожидается к поступлению/)).toHaveAttribute("title", "Ожидается к поступлению · 1 августа 2026 г.");
  });

  it("uses the safe missing-stock state without fake data", () => {
    render(<ProductAvailabilityBlock />);
    expect(screen.getByText("Наличие уточняется")).toBeInTheDocument();
  });
});
