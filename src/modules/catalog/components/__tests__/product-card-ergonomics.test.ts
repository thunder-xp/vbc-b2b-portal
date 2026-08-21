import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const card = source("src/modules/catalog/components/ProductCard.tsx");
const cardFrame = source("src/modules/catalog/components/CatalogProductCardFrame.tsx");
const cartAction = source("src/modules/catalog/components/CatalogQuantityCartAction.tsx");
const grid = source("src/modules/catalog/components/ProductGrid.tsx");
const presentation = source("src/modules/catalog/components/CatalogPresentationPrimitives.tsx");
const pricing = source("src/modules/catalog/components/ProductPricingBlock.tsx");
const availability = source("src/modules/catalog/components/ProductAvailabilityBlock.tsx");

describe("product card ergonomics contracts", () => {
  it("keeps deterministic identity, commercial, availability, and action zones", () => {
    expect(card).toContain("aspect-[4/3]");
    expect(card).toContain("line-clamp-2 h-10");
    expect(cardFrame).toContain('compact ? "h-12" : "h-[5.25rem]"');
    expect(cardFrame).toContain('compact ? "h-8" : "h-[3.25rem]"');
    expect(cardFrame).toContain('compact ? "pt-2" : "pt-3"');
    expect(cardFrame).toContain("min-h-11 justify-end");
  });

  it("uses restrained hover and visible focus without changing border geometry", () => {
    expect(cardFrame).toContain("transition-shadow hover:shadow-md");
    expect(cardFrame).toContain("focus-within:ring-2");
    expect(cardFrame).not.toContain("hover:border-emerald");
  });

  it("keeps price and stock missing-data states stable and explicit", () => {
    expect(pricing).toContain("missingValue={copy.pricePending}");
    expect(pricing).toContain("h-full");
    expect(availability).toContain("if (!stock) return copy.availabilityPending");
    expect(availability).toContain("stock.exactAvailableQuantity");
    expect(availability).toContain("line-clamp-2");
  });

  it("keeps the cart row narrow-safe without broad catalog invalidation", () => {
    expect(cartAction).toContain("grid-cols-[4.5rem_minmax(0,1fr)]");
    expect(cartAction).toContain('className="whitespace-nowrap"');
    expect(cartAction).toContain("copy.addToCart");
    expect(cartAction).not.toContain("router.refresh");
    expect(cartAction).not.toContain("fetch(");
  });

  it("preserves responsive one-to-five-column density", () => {
    expect(grid).toContain("CatalogProductGridFrame");
    expect(presentation).toContain("grid-cols-1");
    expect(presentation).toContain("sm:grid-cols-2");
    expect(presentation).toContain("lg:grid-cols-2");
    expect(presentation).toContain("xl:grid-cols-4");
    expect(presentation).toContain("2xl:grid-cols-5");
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}
