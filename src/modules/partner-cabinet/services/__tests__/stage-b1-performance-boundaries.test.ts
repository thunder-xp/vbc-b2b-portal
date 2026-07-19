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
    const [files, catalogFilterLink] = await Promise.all([
      Promise.all([
      source("src/modules/partner-cabinet/components/PartnerSidebar.tsx"),
      source("src/modules/catalog/components/ProductCard.tsx"),
      source("src/modules/catalog/components/ProductDetail.tsx"),
      source("src/modules/catalog/components/CatalogFilters.tsx"),
      source("src/modules/catalog/components/CategoryMegaMenu.tsx"),
      ]),
      source("src/modules/catalog/components/CatalogFilterLink.tsx"),
    ]);
    expect(files.join("\n").match(/prefetch=\{false\}/g)?.length).toBeGreaterThanOrEqual(9);
    expect(files[3]).toContain("CatalogFilterLink");
    expect(catalogFilterLink).toContain("prefetch={false}");
  });

  it("disables automatic workspace-card prefetch", async () => {
    const files = await Promise.all([
      source("src/modules/partner-cabinet/components/QuickActions.tsx"),
      source("src/modules/partner-cabinet/components/WorkspaceCard.tsx"),
      source("src/modules/partner-cabinet/components/DashboardCard.tsx"),
      source("src/modules/partner-cabinet/components/EmptyState.tsx"),
    ]);
    for (const file of files) expect(file).toContain("prefetch={false}");
  });

  it("keeps the catalog route on direct component imports and one results boundary", async () => {
    const page = await source("app/(partner)/cabinet/catalog/page.tsx");
    expect(page).not.toContain('from "@/src/modules/catalog/components"');
    expect(page.match(/<Suspense/g)).toHaveLength(1);
    expect(page.indexOf("const productsPromise")).toBeLessThan(page.indexOf("await categoriesPromise"));
  });

  it("defines a security-invoker cart count with narrow grants", async () => {
    const migration = await source("supabase/migrations/20260718200000_lightweight_cart_badge.sql");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("cart.created_by = auth.uid()");
    expect(migration).toContain("grant execute on function public.get_active_cart_unit_count(uuid) to authenticated");
    expect(migration).not.toContain("grant execute on function public.get_active_cart_unit_count(uuid) to anon");
  });

  it("keeps unrelated order and proposal clients out of authenticated route imports", async () => {
    const files = await Promise.all([
      source("src/modules/catalog/components/ProductCard.tsx"),
      source("app/(partner)/cabinet/cart/page.tsx"),
      source("app/(partner)/cabinet/orders/page.tsx"),
      source("app/(partner)/cabinet/estimates/[estimateId]/page.tsx"),
    ]);
    expect(files.join("\n")).not.toMatch(/modules\/(orders|estimates)\/components["']/);
    expect(files.join("\n")).not.toContain("../../orders/components\"");
    expect(files.join("\n")).not.toContain("../../estimates/components\"");
  });

  it("keeps the product rendering path free of integration providers", async () => {
    const files = await Promise.all([
      source("app/(partner)/cabinet/catalog/[slug]/page.tsx"),
      source("src/modules/catalog/actions/product-page.action.ts"),
    ]);
    expect(files.join("\n")).not.toMatch(/OneC|integration\/providers|fetch\(/);
  });

  it("counts PostgREST requests at the shared server transport", async () => {
    const serverClient = await source("src/lib/supabase/server.ts");
    expect(serverClient).toContain("recordDatabaseQuery");
    expect(serverClient).toContain('pathname.startsWith("/rest/v1/")');
  });
});

function source(relativePath: string): Promise<string> {
  return readFile(join(root, relativePath), "utf8");
}
