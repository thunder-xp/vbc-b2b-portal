import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("warehouse replenishment storefront routes", () => {
  it("redirects both legacy arrival-history routes to the current collection", () => {
    expect(source("app/(partner)/cabinet/arrivals/page.tsx")).toContain('redirect("/cabinet/catalog/replenishment")');
    expect(source("app/(partner)/cabinet/arrivals/[arrivalId]/page.tsx")).toContain('redirect("/cabinet/catalog/replenishment")');
  });

  it("renders the complete current collection with canonical product cards", () => {
    const page = source("app/(partner)/cabinet/catalog/replenishment/page.tsx");
    expect(page).toContain("getCurrentWarehouseReplenishmentAction");
    expect(page).toContain("<ProductCard");
    expect(page).toContain('contextBadge="ПОПОЛНЕНИЕ"');
    expect(page).not.toContain("sourceOrder");
    expect(page).not.toContain("orderedQuantity");
  });

  it("adds at most five current cards to the curated B2B storefront", () => {
    const action = source("src/modules/catalog/actions/list-merchandising-sections.action.ts");
    const sections = source("src/modules/catalog/components/CatalogMerchandisingSections.tsx");
    expect(action).toContain('labelCode: "REPLENISHMENT"');
    expect(action).toContain("maxProducts: 5");
    expect(action).toContain('href: "/cabinet/catalog/replenishment"');
    expect(sections).toContain("section.maxProducts ?? 10");
    expect(sections).toContain("contextBadge={section.contextBadge}");
  });
});
