import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MerchandisingBadge, MerchandisingBadges } from "../MerchandisingBadges";

describe("MerchandisingBadges", () => {
  it("uses partner-facing labels and renders at most two", () => {
    render(<MerchandisingBadges labels={["NEW", "TOP", "HOT"]} />);
    expect(screen.getByText("Новинки")).toBeInTheDocument();
    expect(screen.getByText("Популярное")).toBeInTheDocument();
    expect(screen.queryByText("Горячая цена")).not.toBeInTheDocument();
  });

  it("renders nothing without active labels", () => {
    const { container } = render(<MerchandisingBadges />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses one canonical badge geometry with a semantic replenishment variant", () => {
    render(<><MerchandisingBadge label="Пополнение" variant="REPLENISHMENT" /><MerchandisingBadges labels={["HOT"]} /></>);
    const replenishment = screen.getByText("Пополнение");
    const hot = screen.getByText("Горячая цена");
    for (const badge of [replenishment, hot]) {
      expect(badge).toHaveClass("min-h-6", "rounded-sm", "border", "px-2", "text-[11px]", "font-semibold", "shadow-sm");
    }
    expect(replenishment).toHaveClass("border-emerald-700", "bg-emerald-50", "text-emerald-900");
  });

  it("uses sentence case and identical geometry for every badge theme", () => {
    render(<><MerchandisingBadges labels={["HOT", "NEW"]} /><MerchandisingBadges labels={["TOP", "SPECIAL_OFFER"]} /><MerchandisingBadge label="Пополнение" variant="REPLENISHMENT" /></>);
    for (const label of ["Горячая цена", "Новинки", "Популярное", "Спецпредложения", "Пополнение"]) {
      expect(screen.getByText(label)).toHaveClass("min-h-6", "rounded-sm", "border", "px-2", "text-[11px]", "font-semibold", "shadow-sm");
    }
  });
});
