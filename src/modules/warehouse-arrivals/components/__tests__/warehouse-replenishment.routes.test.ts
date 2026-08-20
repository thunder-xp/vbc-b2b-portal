import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("warehouse replenishment storefront routes", () => {
  it("redirects both legacy arrival-history routes to the current collection", () => {
    expect(source("app/(partner)/cabinet/arrivals/page.tsx")).toContain('redirect("/cabinet/catalog/replenishment")');
    expect(source("app/(partner)/cabinet/arrivals/[arrivalId]/page.tsx")).toContain('redirect("/cabinet/catalog/replenishment")');
  });

  it("redirects the former standalone page into the canonical catalog collection", () => {
    const page = source("app/(partner)/cabinet/catalog/replenishment/page.tsx");
    expect(page).toContain('redirect("/cabinet/catalog?collection=replenishment")');
    expect(page).not.toContain("ProductCard");
  });

  it("adds at most five current cards to the curated B2B storefront", () => {
    const action = source("src/modules/catalog/actions/list-merchandising-sections.action.ts");
    const sections = source("src/modules/catalog/components/CatalogMerchandisingSections.tsx");
    expect(action).toContain('labelCode: "REPLENISHMENT"');
    expect(action).toContain("maxProducts: 5");
    expect(action).toContain('href: "/cabinet/catalog?collection=replenishment"');
    expect(sections).toContain("section.maxProducts ?? 10");
    expect(sections).toContain("contextBadge={section.contextBadge}");
  });

  it("integrates replenishment into canonical partner page and facet aggregates", () => {
    const migration = source("supabase/migrations/20260820201820_integrate_replenishment_catalog_collection.sql");
    const repository = source("src/modules/catalog/repositories/supabase/catalog.supabase-repository.ts");
    expect(migration).toContain("create or replace function public.catalog_partner_page_v3");
    expect(migration).toContain("create or replace function public.catalog_partner_facets_v2");
    expect(migration).toContain("current_warehouse_replenishment_items replenishment");
    expect(migration).toContain("replenishment.singleton_key = 1");
    expect(migration).toContain("revoke all on function public.catalog_partner_facets_v2");
    expect(repository).toContain('input.collection === "replenishment" ? "REPLENISHMENT"');
  });
});
