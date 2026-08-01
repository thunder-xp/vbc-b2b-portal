import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductRelationSectionsView, relationPromotionMessage } from "../ProductRelationSections";

vi.mock("../../../catalog/components/ProductCard", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <article>{product.name}</article>,
}));
vi.mock("../../../behavior-analytics/components", () => ({ BehaviorViewEvent: () => null }));

const capabilities = {} as never;

describe("ProductRelationSectionsView", () => {
  it("hides empty sections and renders one relation honestly", () => {
    const { rerender } = render(<ProductRelationSectionsView capabilities={capabilities} sections={{ analogs: [], related: [], synchronizedAt: null }} sourceProductId="source" sourceSlug="source" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();

    rerender(<ProductRelationSectionsView capabilities={capabilities} sections={{ analogs: [card("one")], related: [], synchronizedAt: null }} sourceProductId="source" sourceSlug="source" />);
    expect(screen.getByRole("heading", { name: "Аналогичные товары" })).toBeInTheDocument();
    expect(screen.getByText("Product one")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Сопутствующие товары" })).not.toBeInTheDocument();
  });

  it("promotes analogs only for canonical constrained stock states", () => {
    expect(relationPromotionMessage("low_stock", 2)).toContain("заканчивается");
    expect(relationPromotionMessage("out_of_stock", 2)).toContain("временно недоступен");
    expect(relationPromotionMessage("expected", 2)).toContain("ожидается к поступлению");
    expect(relationPromotionMessage("in_stock", 2)).toBeNull();
    expect(relationPromotionMessage("low_stock", 0)).toBeNull();
  });

  it("uses a bounded responsive grid without horizontal overflow primitives", () => {
    const { container } = render(<ProductRelationSectionsView capabilities={capabilities} sections={{ analogs: [card("one"), card("two")], related: [], synchronizedAt: null }} sourceProductId="source" sourceSlug="source" />);
    expect(container.querySelector(".grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-3.xl\\:grid-cols-5")).toBeTruthy();
  });
});

function card(id: string) {
  return { id, sku: `SKU-${id}`, name: `Product ${id}`, slug: id, imageUrl: null, imageFit: "contain" as const, sourcePriority: 0, commercialView: null };
}
