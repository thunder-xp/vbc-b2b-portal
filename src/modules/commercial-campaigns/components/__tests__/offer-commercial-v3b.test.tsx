import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignCommercialSummary } from "../CampaignCommercialSummary";
import { CampaignCountdown } from "../CampaignCountdown";
import type { CampaignCommercialSummary as Summary } from "../../types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const summary: Summary = {
  normalPartnerTotal: "92.00",
  specialBundleTotal: "84.00",
  saving: "8.00",
  savingPercent: 8.69565217,
  currency: "USD",
  retailTotal: "2280.00",
  markupFromRetail: "41.34%",
  markupPercent: 41.34050638,
  skuCount: 1,
  totalUnits: 1,
};
describe("governed commercial hierarchy", () => {
  it.each(["ru", "ro"] as const)(
    "emphasizes actual special price and localizes advantage in %s",
    (locale) => {
      const { container } = render(
        <CampaignCommercialSummary summary={summary} locale={locale} />,
      );
      expect(container.querySelector("[data-special-price]")).toHaveClass(
        "text-xl",
        "font-bold",
        "text-emerald-800",
      );
      expect(container.querySelector(".line-through")).toHaveTextContent("92");
      expect(screen.getByText(/8,7%/)).toBeInTheDocument();
      expect(screen.getByText("41,3%")).toBeInTheDocument();
      expect(container.querySelector("dl")).toHaveClass("tabular-nums");
      expect(
        container.querySelector("dl")?.firstElementChild?.textContent,
      ).toContain("2280".slice(0, 1));
    },
  );
  it("omits missing savings, retail and markup rather than fabricating zero advantage", () => {
    const { container } = render(
      <CampaignCommercialSummary
        locale="ru"
        summary={{
          ...summary,
          normalPartnerTotal: null,
          saving: null,
          savingPercent: null,
          retailTotal: null,
          markupFromRetail: null,
          markupPercent: null,
        }}
      />,
    );
    expect(container.querySelector(".line-through")).toBeNull();
    expect(screen.queryByText("Экономия")).not.toBeInTheDocument();
    expect(screen.queryByText("Наценка от розницы")).not.toBeInTheDocument();
    expect(container.querySelector("[data-special-price]")).toBeInTheDocument();
  });
  it.each([
    [259201, "over-72h", "text-zinc-600"],
    [259200, "24-72h", "text-amber-800"],
    [86400, "24-72h", "text-amber-800"],
    [86399, "under-24h", "text-amber-900"],
  ])("uses actual end-time band %i", (remaining, band, color) => {
    const { container } = render(
      <CampaignCountdown remainingSeconds={Number(remaining)} compact />,
    );
    expect(container.querySelector("[data-time-band]")).toHaveAttribute(
      "data-time-band",
      String(band),
    );
    expect(container.querySelector("[data-time-band]")).toHaveClass(
      String(color),
    );
    expect(container.textContent).not.toMatch(
      /Успейте|Последний шанс|Осталось мало/,
    );
  });
  it("labels expired countdown without fake urgency", () => {
    render(<CampaignCountdown remainingSeconds={0} compact />);
    expect(screen.getByText("Предложение завершено")).toBeInTheDocument();
  });
});
