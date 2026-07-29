import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductAvailabilityBlock } from "../ProductAvailabilityBlock";

describe("ProductAvailabilityBlock", () => {
  it.each([
    ["in_stock", "В наличии: 12 шт."],
    ["low_stock", "Осталось: 2 шт."],
    ["expected", "Ожидается к поступлению\n1 августа 2026 г."],
    ["out_of_stock", "Нет в наличии"],
  ] as const)("renders the %s state as text in a stable zone", (status, label) => {
    const { container } = render(<ProductAvailabilityBlock stock={{ status, label } as never} />);
    expect(container.firstElementChild).toHaveTextContent(label.replace("\n", " "));
    expect(container.firstElementChild).toHaveClass("h-full", "border-l-2");
  });

  it("preserves predictable wrapping for an expected arrival", () => {
    render(<ProductAvailabilityBlock stock={{ status: "expected", label: "Ожидается к поступлению\n1 августа 2026 г." } as never} />);
    expect(screen.getByText(/Ожидается к поступлению/)).toHaveClass("line-clamp-2", "whitespace-pre-line");
  });

  it("uses the safe missing-stock state without fake data", () => {
    render(<ProductAvailabilityBlock />);
    expect(screen.getByText("Наличие уточняется")).toBeInTheDocument();
  });
});
