import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CatalogFilters } from "../CatalogFilters";

describe("catalog filter typography", () => {
  it("uses the compact sidebar hierarchy for groups, options, selected values, and counters", () => {
    const { container } = render(<CatalogFilters
      availability="expected"
      facets={[{
        key: "property_11111111-1111-4111-8111-111111111111",
        label: "AI Technologies",
        values: [
          { value: "WizSense", count: 22, selected: true },
          { value: "WizMind", count: 14, selected: false },
        ],
      }]}
    />);

    expect(screen.getByText("AI Technologies").closest("summary")).toHaveClass(
      "min-h-9",
      "text-xs",
      "font-semibold",
      "leading-[1.35]",
    );

    const selectedOption = screen.getByRole("link", { name: /WizSense/ });
    const idleOption = screen.getByRole("link", { name: /WizMind/ });
    expect(selectedOption).toHaveClass("min-h-8", "text-[11px]", "font-semibold", "leading-[1.35]");
    expect(idleOption).toHaveClass("min-h-8", "text-[11px]", "font-medium", "leading-[1.35]");
    expect(idleOption).not.toHaveClass("font-semibold");

    expect(screen.getByText("22")).toHaveClass(
      "text-[11px]",
      "font-medium",
      "leading-[1.35]",
      "tabular-nums",
    );
    expect(container.querySelector("a svg[aria-label]")?.closest("a")).toHaveClass(
      "text-[11px]",
      "font-semibold",
      "leading-[1.35]",
    );
    expect(container.querySelector("h2")).toHaveClass("text-xs", "font-semibold", "leading-[1.35]");
    expect(container.querySelector("h2 + p")).toHaveClass(
      "text-[10px]",
      "font-medium",
      "leading-[1.35]",
      "tabular-nums",
    );
  });
});
