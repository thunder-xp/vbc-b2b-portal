import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublicRetailProductCard } from "../components/PublicRetailProductCard";
import type { PublicRetailProductSummaryDto } from "../types";

const product: PublicRetailProductSummaryDto = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "camera-model-1",
  sku: "CAM-001",
  name: "Camera Model 1",
  shortDescription: null,
  image: null,
  brand: null,
  category: null,
  price: { amount: 1299, currency: "MDL", vatPresentation: "not_specified" },
  availability: "in_stock",
  highlights: [],
  calculatorEligible: false,
  isPopular: true,
};

describe("Public Retail current Popular badge", () => {
  it("renders the shared TOP token even outside the Popular collection", () => {
    render(<PublicRetailProductCard
      badge="Новинки"
      badgeVariant="NEW"
      locale="ru"
      product={product}
    />);
    expect(screen.getByText("Популярное")).toHaveClass(
      "border-amber-300",
      "bg-amber-50",
      "text-amber-900",
    );
    expect(screen.getByText("Новинки")).toBeInTheDocument();
  });

  it("localizes the same current Popular meaning in Romanian", () => {
    render(<PublicRetailProductCard locale="ro" product={product} />);
    expect(screen.getByText("Popular")).toHaveClass("text-amber-900");
  });
});
