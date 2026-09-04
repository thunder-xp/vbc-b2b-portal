import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductCompetitorPricing } from "../ProductCompetitorPricing";
import type { ProductCompetitorPricingItem } from "../../types";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));

describe("ProductCompetitorPricing", () => {
  it("shows shared retail, own quantity, retail discount, and positive Novotech benefit", () => {
    const { container } = render(<ProductCompetitorPricing analyticsHref="?tab=analytics&returnTo=%2Fcabinet%2Fcatalog%3Fpage%3D3" items={[item]} locale="ru" />);
    expect(screen.getByText("Розничная цена конкурента")).toBeInTheDocument();
    expect(screen.getByText("1 777 MDL")).toBeInTheDocument();
    expect(screen.getByText("при 10 шт.")).toBeInTheDocument();
    expect(screen.getByText("Скидка от розничной")).toBeInTheDocument();
    expect(screen.getByText(/Ваша выгода с Novotech/)).toHaveClass("text-emerald-700");
    expect(screen.getByRole("link", { name: "Обновить цену" })).toHaveAttribute("href", expect.stringContaining("returnTo="));
    expect(screen.getByRole("heading", { name: "Цены конкурентов" })).toHaveClass("text-base", "font-semibold", "leading-6");
    expect(container.querySelector("section")).not.toHaveClass("border-t");
  });

  it("uses neutral wording when Novotech is more expensive", () => {
    render(<ProductCompetitorPricing items={[{ ...item, novotechDifferenceAmount: -36, novotechDifferencePercent: -4.5 }]} locale="ru" />);
    expect(screen.getByText(/Novotech выше на/)).toHaveClass("text-amber-800");
    expect(screen.queryByText(/Ваша выгода с Novotech/)).not.toBeInTheDocument();
  });

  it("shows Analytics CTA without inventing an own-company price", () => {
    render(<ProductCompetitorPricing items={[{ ...item, ownPrice: null, ownCurrency: null, ownObservationDate: null, ownQuantity: null, retailDiscountAmount: null, retailDiscountPercent: null, novotechDifferenceAmount: null, novotechDifferencePercent: null, comparisonStatus: "price_unavailable" }]} locale="ru" />);
    expect(screen.getByRole("link", { name: "Добавить свою цену" })).toHaveAttribute("href", "?tab=analytics");
    expect(screen.queryByText("Ваша цена у Exterior")).not.toBeInTheDocument();
  });

  it("explains a currency mismatch without a misleading delta and has natural RO copy", () => {
    render(<ProductCompetitorPricing items={[{ ...item, retailDiscountAmount: null, retailDiscountPercent: null, retailComparisonStatus: "currency_mismatch", novotechDifferenceAmount: null, novotechDifferencePercent: null, comparisonStatus: "currency_mismatch" }]} locale="ro" />);
    expect(screen.getByRole("heading", { name: "Prețurile concurenților" })).toBeInTheDocument();
    expect(screen.getAllByText("Comparația nu este disponibilă — monede diferite.")).toHaveLength(2);
  });
});

const item: ProductCompetitorPricingItem = {
  competitorId: "competitor-1", competitorName: "Exterior", retailPrice: 1777, retailCurrency: "MDL",
  retailEffectiveDate: "2026-08-08", ownPrice: 1590, ownCurrency: "MDL", ownObservationDate: "2026-08-20",
  ownQuantity: 10, retailDiscountAmount: 187, retailDiscountPercent: 10.5234, retailComparisonStatus: "comparable", novotechPrice: 836,
  novotechCurrency: "MDL", novotechDifferenceAmount: 754, novotechDifferencePercent: 47.4214,
  comparisonStatus: "comparable",
};
