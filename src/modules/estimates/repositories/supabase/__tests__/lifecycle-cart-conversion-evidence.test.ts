import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));

import { SupabaseEstimateLifecycleRepository } from "../lifecycle.supabase-repository";

describe("SupabaseEstimateLifecycleRepository conversion evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = { select: mocks.select, eq: mocks.eq, order: mocks.order };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
  });

  it("selects and maps STANDARD and CAMPAIGN source while malformed source fails closed", async () => {
    mocks.order.mockResolvedValue({
      data: [{
        version_id: "version-1",
        created_by: "user-1",
        direction: "estimate_to_cart",
        cart: {
          id: "cart-1",
          company_id: "company-1",
          created_by: "user-1",
          status: "active",
          items: [
            { product_id: "product-1", quantity: 2, commercial_source: "STANDARD" },
            { product_id: "product-1", quantity: "1", commercial_source: "CAMPAIGN" },
            { product_id: "product-1", quantity: 100, commercial_source: "LEGACY_UNKNOWN" },
          ],
        },
      }],
      error: null,
    });

    const result = await new SupabaseEstimateLifecycleRepository()
      .listVersionCartConversions("estimate-1", "version-1");

    expect(mocks.from).toHaveBeenCalledWith("estimate_cart_conversions");
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("product_id, quantity, commercial_source"));
    expect(result[0]?.cart?.items).toEqual([
      { productId: "product-1", quantity: 2, commercialSource: "STANDARD" },
      { productId: "product-1", quantity: 1, commercialSource: "CAMPAIGN" },
      { productId: "product-1", quantity: 100, commercialSource: null },
    ]);
  });
});
