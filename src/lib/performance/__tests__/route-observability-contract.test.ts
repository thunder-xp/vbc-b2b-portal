import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("authenticated route observability contract", () => {
  it.each([
    ["app/(partner)/cabinet/page.tsx", "dashboard"],
    ["app/(partner)/cabinet/catalog/page.tsx", "catalog"],
    ["app/(partner)/cabinet/catalog/[slug]/page.tsx", "product_detail"],
    ["app/(partner)/cabinet/cart/page.tsx", "cart"],
    ["app/(partner)/cabinet/orders/page.tsx", "orders"],
    ["app/(partner)/cabinet/offers/page.tsx", "special_offers"],
    ["app/(partner)/cabinet/estimates/page.tsx", "estimates"],
    ["app/(partner)/cabinet/estimates/[estimateId]/page.tsx", "estimate_detail"],
  ])("owns one route boundary in %s", async (file, category) => {
    const contents = await source(file);
    expect(contents.match(new RegExp(`withRoutePerformance\\(\\"${category}\\"`, "g"))).toHaveLength(1);
    expect(contents).not.toContain("emitRequestTotal");
  });

  it("covers the required cart attribution stages without changing its read flow", async () => {
    const service = await source("src/modules/orders/services/cart.service.ts");
    for (const stage of [
      "cart_context",
      "active_cart",
      "items_and_reconciliation",
      "catalog_projection",
      "commercial_resolution",
      "checkout_configuration",
    ]) expect(service).toContain(`\"${stage}\"`);
    expect(service).toContain("Promise.all([");
  });

  it("normalizes dashboard performance logs and preserves branch stages", async () => {
    const [action, service] = await Promise.all([
      source("src/modules/partner-cabinet/actions/workspace-home.action.ts"),
      source("src/modules/partner-cabinet/services/workspace-home.service.ts"),
    ]);
    for (const stage of [
      "commercial_freshness",
      "dashboard_aggregate",
      "product_selections",
      "special_offers",
      "opportunities",
      "support_tickets",
      "estimate_sales_opportunities",
      "finance_guidance",
      "reference_enrichment",
    ]) expect(service).toContain(`\"${stage}\"`);
    expect(`${action}\n${service}`).not.toMatch(/dashboard_load_started|dashboard_load_completed|dashboard_read_completed/);
  });

  it("uses canonical catalog telemetry and keeps the streamed results boundary", async () => {
    const [page, results, service, listProducts, listFacets] = await Promise.all([
      source("app/(partner)/cabinet/catalog/page.tsx"),
      source("app/(partner)/cabinet/catalog/CatalogResults.tsx"),
      source("src/modules/catalog/services/catalog.service.ts"),
      source("src/modules/catalog/actions/list-products.action.ts"),
      source("src/modules/catalog/actions/list-facets.action.ts"),
    ]);
    expect(page).toContain('"taxonomy"');
    expect(page).toContain('"commercial_context"');
    expect(listProducts).toContain('"page_aggregate"');
    expect(listFacets).toContain('"facets"');
    expect(`${page}\n${results}`).toContain("deferRoutePerformance");
    expect(page).toContain("<Suspense");
    expect(service).not.toContain("catalog_performance_stage");
    expect(service).not.toContain("product_reference_batch_resolved");
    expect(service).not.toContain("measurePerformanceStage");
  });

  it("attributes product detail and estimate detail parallel reads", async () => {
    const [product, estimate] = await Promise.all([
      source("app/(partner)/cabinet/catalog/[slug]/page.tsx"),
      source("app/(partner)/cabinet/estimates/[estimateId]/page.tsx"),
    ]);
    for (const stage of [
      "commercial_context",
      "workspace_context",
      "merchandising",
      "relation_summary",
      "knowledge",
      "favorites",
      "competitor_pricing",
    ]) expect(product).toContain(`\"${stage}\"`);
    for (const stage of ["estimate", "services", "commercial_options", "workflow"]) {
      expect(estimate).toContain(`\"${stage}\"`);
    }
    expect(product).toContain("Promise.all([");
    expect(estimate).toContain("Promise.all([");
  });

  it("counts auth and provider work at the actual outbound boundaries", async () => {
    const [authFactory, provider] = await Promise.all([
      source("src/modules/access-control/actions/service-factory.ts"),
      source("src/modules/integration/providers/one-c/one-c-odata-client.ts"),
    ]);
    expect(authFactory).toMatch(/recordAuthCall\(\);\s*const \{ data, error \} = await supabase\.auth\.getUser\(\)/);
    expect(provider).toMatch(/recordLiveProviderCall\(\);\s*response = await fetch/g);
  });
});

function source(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}
