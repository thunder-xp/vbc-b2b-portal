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

  it("preserves canonical geometry and accessible text for icon content", () => {
    render(<MerchandisingBadge icon={<svg aria-hidden="true" data-testid="badge-icon" />} label="Popular" variant="TOP" />);

    const badge = screen.getByLabelText("Popular");
    expect(screen.getByTestId("badge-icon")).toBeInTheDocument();
    expect(screen.getByText("Popular")).toHaveClass("sr-only");
    expect(badge).toHaveClass("h-6", "rounded-sm", "border", "size-6");
  });

  it("uses one canonical badge geometry with a semantic replenishment variant", () => {
    render(<><MerchandisingBadge label="Пополнение" variant="REPLENISHMENT" /><MerchandisingBadges labels={["HOT"]} /></>);
    const replenishment = screen.getByText("Пополнение");
    const hot = screen.getByText("Горячая цена");
    for (const badge of [replenishment, hot]) {
      expect(badge).toHaveClass("h-6", "shrink-0", "whitespace-nowrap", "rounded-sm", "border", "px-2", "text-[11px]", "font-semibold", "leading-4", "shadow-sm");
    }
    expect(replenishment).toHaveClass("border-emerald-700", "bg-emerald-50", "text-emerald-900");
  });

  it("uses sentence case and identical geometry for every badge theme", () => {
    render(<><MerchandisingBadges labels={["HOT", "NEW"]} /><MerchandisingBadges labels={["TOP", "SPECIAL_OFFER"]} /><MerchandisingBadge label="Пополнение" variant="REPLENISHMENT" /></>);
    for (const label of ["Горячая цена", "Новинки", "Популярное", "Спецпредложения", "Пополнение"]) {
      expect(screen.getByText(label)).toHaveClass("h-6", "shrink-0", "whitespace-nowrap", "rounded-sm", "border", "px-2", "text-[11px]", "font-semibold", "leading-4", "shadow-sm");
    }
  });

  it("keeps Special Offer on the canonical badge geometry", () => {
    render(<><MerchandisingBadge label="SPECIAL" variant="SPECIAL_OFFER" /><MerchandisingBadge label="NEW" variant="NEW" /></>);
    const special = screen.getByText("SPECIAL");
    const standard = screen.getByText("NEW");
    const geometry = ["inline-flex", "h-6", "max-w-full", "shrink-0", "items-center", "whitespace-nowrap", "rounded-sm", "border", "px-2", "text-center", "text-[11px]", "font-semibold", "leading-4", "shadow-sm"];
    for (const badge of [special, standard]) {
      expect(badge).toHaveClass(...geometry);
      expect(badge).toHaveAttribute("data-merchandising-badge");
    }
    expect(special).toHaveClass("border-orange-600", "bg-orange-500", "text-white");
  });
});
