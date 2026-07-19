import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const page = source("app/(partner)/cabinet/catalog/page.tsx");
const results = source("app/(partner)/cabinet/catalog/CatalogResults.tsx");
const search = source("src/modules/catalog/components/CatalogSearch.tsx");
const filterLink = source("src/modules/catalog/components/CatalogFilterLink.tsx");

describe("catalog streaming and interaction boundaries", () => {
  it("starts product and facet work independently", () => {
    expect(page).toContain("const productsPromise = listCatalogProductsAction");
    expect(page).toContain("const facetsPromise = listCatalogFacetsAction");
    expect(results).not.toContain("Promise.all([\n    productsPromise,\n    facetsPromise");
  });

  it("keeps products outside one secondary facet Suspense boundary", () => {
    expect(results).toContain("<Suspense fallback={<CatalogFacetFallback />}");
    expect(results).toContain("<CatalogFacetResults");
    expect(results.indexOf("<ProductGrid")).toBeGreaterThan(results.indexOf("<CatalogFacetResults"));
    expect(results).toContain("facets={result.success ? result.data : []}");
  });

  it("renders active attribute values without waiting for facet labels", () => {
    expect(results).toContain("`Характеристика: ${value}`");
    expect(results).not.toContain("productsResult.data.facets.find");
  });

  it("aborts stale live searches and suppresses equivalent requests", () => {
    expect(search).toContain("signal: controller.signal");
    expect(search).toContain("controller.abort()");
    expect(search).toContain("lastRequestedRef.current === requestKey");
    expect(search).toContain("isLikelyExactSku(normalized) ? 100 : 250");
  });

  it("prevents an equivalent filter navigation while it is pending", () => {
    expect(filterLink).toContain("pendingHref.current === href");
    expect(filterLink).toContain("event.preventDefault()");
    expect(filterLink).toContain("startTransition(() => router.push(href))");
  });
});

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}
