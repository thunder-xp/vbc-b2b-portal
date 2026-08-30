import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RetailPriceHistoryChart } from "../RetailPriceHistoryChart";

const record = vi.fn();
vi.mock("../../../behavior-analytics/components/BehaviorViewEvent", () => ({
  recordBehaviorInteraction: (...args: unknown[]) => record(...args),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
}));

describe("RetailPriceHistoryChart", () => {
  it("renders actual points, bounded ranges, and an accessible data table", () => {
    render(<RetailPriceHistoryChart history={history} productId="product-1" />);
    expect(screen.getByRole("group", { name: "График истории розничной цены" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(document.querySelector("[data-line-shape='step-after']")).toBeInTheDocument();
    expect(screen.getByTestId("price-history-chart")).toHaveClass("bg-zinc-50/50", "shadow-sm");
    expect(document.querySelectorAll("svg line").length).toBeGreaterThanOrEqual(7);
    expect(document.querySelector("svg path")?.getAttribute("fill")).toContain("price-history-fill-product-1");
    expect(document.querySelectorAll("svg circle")[1]).toHaveAttribute("r", "6");
    expect(screen.getByRole("link", { name: "12 месяцев" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "3 месяца" })).toHaveAttribute("href", "?tab=pricing&range=3m");
    fireEvent.click(screen.getByText("Показать данные"));
    expect(screen.getByRole("columnheader", { name: "Розничная цена" })).toBeInTheDocument();
    expect(screen.getByText("2 399,00")).toBeInTheDocument();
  });

  it("records only safe range metadata", () => {
    render(<RetailPriceHistoryChart history={history} productId="product-1" />);
    const rangeLink = screen.getByRole("link", { name: "6 месяцев" });
    rangeLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(rangeLink);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "retail_price_history_range_changed",
      metadataSafe: { range: "6m" },
    }));
    expect(JSON.stringify(record.mock.calls)).not.toContain("2499");
    expect(JSON.stringify(record.mock.calls)).not.toContain("2399");
  });
});

const history = {
  current: { amount: 2499, currency: "MDL", effectiveAt: "2026-07-20T00:00:00Z" },
  points: [
    { amount: 2399, currency: "MDL", effectiveAt: "2026-07-12T00:00:00Z", source: "initial_baseline" as const },
    { amount: 2499, currency: "MDL", effectiveAt: "2026-07-20T00:00:00Z", source: "price_sync_snapshot" as const },
  ],
  firstAt: "2026-07-12T00:00:00Z",
  lastAt: "2026-07-20T00:00:00Z",
  previousAmount: 2399,
  minimumAmount: 2399,
  maximumAmount: 2499,
  mode: "accumulated" as const,
  range: "12m" as const,
  truncated: false,
  formattedCurrent: "2 499,00 MDL",
  formattedPrevious: "2 399,00 MDL",
  formattedMinimum: "2 399,00 MDL",
  formattedMaximum: "2 499,00 MDL",
  formattedAbsoluteChange: "+100,00 MDL",
  formattedPercentageChange: "+4,17%",
};
