// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { ExternalPriceComparison } from "../components/ExternalPriceComparison";

const commercialView = {
  productId: "product-1",
  partnerPrice: { amount: 188.76, currencyCode: "USD", formattedAmount: "188.76 USD" },
  retailPrice: { amount: 4_100, currencyCode: "MDL", formattedAmount: "4 100 MDL" },
  stock: null,
  isDemoData: false,
} as ProductCommercialViewDto;

describe("partner external-price comparison", () => {
  it("compares partner with partner and retail with retail while showing freshness", () => {
    render(<ExternalPriceComparison commercialView={commercialView} locale="ru" prices={[
      price("partner", 185, "USD"),
      price("retail", 4_300, "MDL"),
    ]} />);

    expect(screen.getByText(/Exterior дешевле на 3,76 USD \/ 2\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/Novotech дешевле на 200,00 MDL \/ 4\.7%/)).toBeInTheDocument();
    expect(screen.getByText(/Прайс от 08\.08\.2026/)).toBeInTheDocument();
  });

  it("does not derive a comparison across currencies", () => {
    render(<ExternalPriceComparison commercialView={commercialView} locale="ru" prices={[
      price("partner", 3_500, "MDL"),
    ]} />);

    expect(screen.getByText(/3 500,00 MDL/)).toBeInTheDocument();
    expect(screen.getByText(/188,76 USD/)).toBeInTheDocument();
    expect(screen.queryByText(/дешевле/)).not.toBeInTheDocument();
    expect(screen.queryByText(/сопоставима/)).not.toBeInTheDocument();
  });

  it("renders a retail-only import without fabricating a partner comparison", () => {
    render(<ExternalPriceComparison commercialView={commercialView} locale="ru" prices={[price("retail", 4_100, "MDL")]} />);
    expect(screen.getByText(/Розничная цена/)).toBeInTheDocument();
    expect(screen.queryByText(/Партнёрская цена/)).not.toBeInTheDocument();
    expect(screen.getByText(/Цена сопоставима/)).toBeInTheDocument();
  });
});

function price(priceType: "partner" | "retail", amount: number, currency: string) {
  return {
    sourceId: "source-exterior",
    sourceName: "Exterior",
    priceType,
    amount,
    currency,
    observedAt: "2026-08-08",
  };
}
