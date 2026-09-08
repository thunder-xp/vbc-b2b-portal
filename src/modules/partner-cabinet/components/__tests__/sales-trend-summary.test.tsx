import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceHomeDto } from "../../services";
import { SalesTrendSummary } from "../SalesTrendSummary";

describe("SalesTrendSummary", () => {
  it.each([
    ["ru", "Период анализа продаж", "30 дн.", "к аналогичному периоду 2025 г."],
    ["ro", "Perioada analizei vânzărilor", "30 zile", "față de perioada similară din 2025"],
  ] as const)("renders one active default and complete %s copy", (locale, groupName, defaultLabel, comparisonCopy) => {
    render(<SalesTrendSummary locale={locale} series={series()} />);

    const group = screen.getByRole("group", { name: groupName });
    expect(within(group).getByRole("button", { name: defaultLabel })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(screen.getByText(new RegExp(comparisonCopy))).toBeInTheDocument();
  });

  it("switches precomputed periods locally without fetch and updates all selected metrics", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<SalesTrendSummary locale="ru" series={series()} />);

    expect(screen.getByText(/1\s000,00\sMDL/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "180 дн." }));

    expect(screen.getByRole("button", { name: "180 дн." })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 дн." })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/8\s000,00\sMDL/)).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("+100,0% · Рост")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps currencies isolated and exposes semantic no-baseline states", () => {
    const values = series();
    values.push({
      ...values[0],
      currency: "EUR",
      comparisons: values[0].comparisons.map((comparison) => ({
        ...comparison,
        currentAmount: 500,
        previousAmount: 0,
        changePercent: null,
        state: "NEW_ACTIVITY" as const,
      })),
    });
    const { container } = render(<SalesTrendSummary locale="ru" series={values} />);

    expect(container.querySelector('[data-sales-currency-summary="MDL"]')).toHaveTextContent(/1\s000,00\sMDL/);
    expect(container.querySelector('[data-sales-currency-summary="EUR"]')).toHaveTextContent(/500,00\s€/);
    expect(container.querySelector('[data-sales-currency-summary="EUR"]')).toHaveTextContent("Новая активность");
  });
});

function series(): NonNullable<WorkspaceHomeDto["salesAnalytics"]>["series"] {
  return [{
    currency: "MDL",
    total: 10_000,
    orderCount: 10,
    averageOrder: 1_000,
    comparisons: ([30, 60, 90, 180] as const).map((days, index) => ({
      days,
      currentStart: days === 30 ? "2026-08-10" : "2026-03-13",
      currentEnd: "2026-09-08",
      previousStart: days === 30 ? "2025-08-10" : "2025-03-13",
      previousEnd: "2025-09-08",
      currentAmount: [1_000, 2_000, 4_000, 8_000][index],
      previousAmount: [500, 1_000, 2_000, 4_000][index],
      currentOrderCount: (index + 1) * 2,
      previousOrderCount: index + 1,
      currentAverageOrder: 500,
      changePercent: 100,
      state: "INCREASE" as const,
    })),
    points: [],
  }];
}
