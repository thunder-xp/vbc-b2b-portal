import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

describe("Stage B1 authenticated rendering boundaries", () => {
  it("keeps normal workspace rendering independent from the 1C provider", async () => {
    const factory = await source("src/modules/partner-cabinet/actions/workspace-context.factory.ts");
    expect(factory).not.toContain("getOneCEnv");
    expect(factory).not.toContain("createPartnerLookupService");
    expect(factory).toContain("SupabasePartnerPriceTypeReadModel");
  });

  it("keeps the shared shell on a lightweight runtime import graph", async () => {
    const [action, factory, repository] = await Promise.all([
      source("src/modules/partner-cabinet/actions/workspace-context.action.ts"),
      source("src/modules/partner-cabinet/actions/workspace-context.factory.ts"),
      source("src/modules/partner-cabinet/repositories/supabase-partner-shell.repository.ts"),
    ]);
    expect(action).toContain('from "./workspace-context.factory"');
    expect(action).not.toContain('from "./service-factory"');
    expect(factory).not.toMatch(/Catalog|Campaign|Opportunity|PartnerSupport|WorkspaceDashboard/);
    expect(repository).not.toContain("createAdminClient");
    expect(repository).not.toMatch(/OneC|integration\/providers/);
  });

  it("reuses one request-scoped Supabase client and defers non-rendered bootstrap work", async () => {
    const [serverClient, factory, service] = await Promise.all([
      source("src/lib/supabase/server.ts"),
      source("src/modules/partner-cabinet/actions/workspace-context.factory.ts"),
      source("src/modules/partner-cabinet/services/workspace-context.service.ts"),
    ]);
    expect(serverClient).toContain("export const createClient = cache(");
    expect(factory).toContain("after(task)");
    expect(service).toContain("scheduleDeferredTask");
  });

  it("keeps bounded cart and notification reads parallel and failure-tolerant", async () => {
    const layout = await source("app/(partner)/cabinet/layout.tsx");
    expect(layout).toContain("await Promise.all([");
    expect(layout).toContain("getCartItemCountAction");
    expect(layout).toContain("getNotificationSummaryAction");
    expect(layout).toContain("cartItemCountResult?.success ? cartItemCountResult.data : 0");
    expect(layout).toContain("notificationSummaryResult.success");
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
      source("src/modules/catalog/components/CatalogCategoryMenu.tsx"),
      ]),
      source("src/modules/catalog/components/CatalogFilterLink.tsx"),
    ]);
    expect(files[0]).toContain("prefetch={intentPrefetch}");
    expect(files[0]).toContain("onMouseEnter={startHoverPrefetch}");
    expect(files[0]).toContain("onMouseLeave={cancelHoverPrefetch}");
    expect(files[0]).toContain("}, 100)");
    expect(files[0]).toContain("onFocus={() => setIntentPrefetch(true)}");
    expect(files.slice(1).join("\n").match(/prefetch=\{false\}/g)?.length).toBeGreaterThanOrEqual(8);
    expect(files[3]).toContain("CatalogFilterLink");
    expect(catalogFilterLink).toContain("prefetch={false}");
  });

  it("provides fixed-size transition feedback without route-wide client state", async () => {
    const [indicator, loading] = await Promise.all([
      source("src/modules/partner-cabinet/components/NavigationPendingIndicator.tsx"),
      source("app/(partner)/cabinet/loading.tsx"),
    ]);
    expect(indicator).toContain("useLinkStatus");
    expect(indicator).toContain('pending ? "visible" : "invisible"');
    expect(loading).toContain('role="status"');
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
    expect(page).toContain('routeState.mode === "curated"');
    expect(page).toContain("productsPromise={listCatalogProductsAction({");
    expect(page).not.toContain("const productsPromise");
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
