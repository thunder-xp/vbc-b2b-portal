import { describe, expect, it } from "vitest";

import { mergeLiveCommerceSelection, normalizeStoredLiveCommerceSelection, type LiveCommerceSelectionProduct } from "../live-commerce-selection";

const product: LiveCommerceSelectionProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  sku: "400540",
  name: "DH-C4K-P",
  slug: "dh-c4k-p",
  imageUrl: null,
  partnerPrice: { amount: 52.9, currencyCode: "USD", formattedAmount: "$52.90", lastUpdatedAt: "2026-09-05T00:00:00Z" },
  stock: { status: "in_stock", label: "Available", exactAvailableQuantity: 487, lastUpdatedAt: "2026-09-05T00:00:00Z" },
};

describe("live commerce working selection", () => {
  it("merges duplicate products and caps the resulting quantity", () => {
    const once = mergeLiveCommerceSelection([], { product, quantity: 2 });
    expect(mergeLiveCommerceSelection(once, { product, quantity: 3 })).toEqual([{ ...product, quantity: 5 }]);
    expect(mergeLiveCommerceSelection([{ ...product, quantity: 9998 }], { product, quantity: 4 })[0]?.quantity).toBe(9999);
  });

  it("restores only bounded valid session data without trusting unknown fields", () => {
    expect(normalizeStoredLiveCommerceSelection([{ ...product, quantity: 4 }, { id: "broken" }])).toEqual([{ ...product, quantity: 4 }]);
    expect(normalizeStoredLiveCommerceSelection("not-an-array")).toEqual([]);
  });
});
