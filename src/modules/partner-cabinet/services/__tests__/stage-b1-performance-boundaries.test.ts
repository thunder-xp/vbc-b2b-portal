import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

describe("Stage B1 authenticated rendering boundaries", () => {
  it("keeps normal workspace rendering independent from the 1C provider", async () => {
    const factory = await source("src/modules/partner-cabinet/actions/service-factory.ts");
    expect(factory).not.toContain("getOneCEnv");
    expect(factory).not.toContain("createPartnerLookupService");
    expect(factory).toContain("findPriceTypeName");
  });

  it("uses the lightweight cart aggregate for the shell badge", async () => {
    const service = await source("src/modules/orders/services/cart.service.ts");
    const method = service.slice(service.indexOf("async getItemCount"), service.indexOf("async addItem"));
    expect(method).toContain("getActiveItemCount");
    expect(method).not.toContain("listItems");
    expect(method).not.toContain("getProductCommercialViews");
  });

  it("controls prefetch on expensive authenticated navigation", async () => {
    const files = await Promise.all([
      source("src/modules/partner-cabinet/components/PartnerSidebar.tsx"),
      source("src/modules/catalog/components/ProductCard.tsx"),
      source("src/modules/catalog/components/ProductDetail.tsx"),
      source("src/modules/catalog/components/CatalogFilters.tsx"),
      source("src/modules/catalog/components/CategoryMegaMenu.tsx"),
    ]);
    expect(files.join("\n").match(/prefetch=\{false\}/g)?.length).toBeGreaterThanOrEqual(12);
  });

  it("defines a security-invoker cart count with narrow grants", async () => {
    const migration = await source("supabase/migrations/20260718200000_lightweight_cart_badge.sql");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("cart.created_by = auth.uid()");
    expect(migration).toContain("grant execute on function public.get_active_cart_unit_count(uuid) to authenticated");
    expect(migration).not.toContain("grant execute on function public.get_active_cart_unit_count(uuid) to anon");
  });
});

function source(relativePath: string): Promise<string> {
  return readFile(join(root, relativePath), "utf8");
}
