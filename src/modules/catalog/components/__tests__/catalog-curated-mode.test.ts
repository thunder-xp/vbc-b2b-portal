import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const page = source("app/(partner)/cabinet/catalog/page.tsx");
const curated = source("app/(partner)/cabinet/catalog/CuratedCatalogResults.tsx");
const discovery = source("app/(partner)/cabinet/catalog/CatalogResults.tsx");

describe("catalog curated mode boundaries", () => {
  it("selects one mutually exclusive server data path", () => {
    expect(page).toContain('routeState.mode === "curated"');
    expect(page).toContain("listCatalogMerchandisingSectionsAction()");
    expect(page).toContain("listCatalogProductsAction({");
    expect(page).not.toContain("isCatalogLanding");
  });

  it("keeps full catalog UI out of the curated result component", () => {
    expect(curated).toContain("CatalogMerchandisingSections");
    expect(curated).not.toContain("listCatalogFacetsAction");
    expect(curated).not.toContain("CatalogPresentation");
    expect(curated).not.toContain("totalCount");
    expect(curated).not.toContain("CatalogPagination");
  });

  it("keeps merchandising reads out of discovery results", () => {
    expect(discovery).toContain("listCatalogFacetsAction");
    expect(discovery).not.toContain("listCatalogMerchandisingSectionsAction");
    expect(discovery).not.toContain("CatalogMerchandisingSections");
  });

  it("exposes a stable unfiltered full-catalog entry", () => {
    expect(page).toContain('href="/cabinet/catalog?view=all"');
    expect(page).toContain("Весь каталог");
  });

  it("does not fetch or render hidden full-catalog data in curated mode", () => {
    expect(curated).not.toContain("productsPromise");
    expect(curated).not.toContain("facets");
    expect(curated).not.toContain("CatalogFilters");
    expect(page).not.toContain("const productsPromise");
  });

  it("does not pass event handlers from the merchandising server component", () => {
    const sections = source("src/modules/catalog/components/CatalogMerchandisingSections.tsx");
    expect(sections).toContain("BehaviorTrackedCatalogLink");
    expect(sections).not.toContain("onClick=");
    expect(sections).not.toContain("recordBehaviorInteraction");
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}
