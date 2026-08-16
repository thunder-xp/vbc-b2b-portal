import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("shared B2B/B2C catalog presentation architecture", () => {
  it("uses the same data-free card, grid, toolbar, filter and pagination primitives", () => {
    const b2bCard = read("src/modules/catalog/components/ProductCard.tsx");
    const publicCard = read("src/modules/public-retail/components/PublicRetailProductCard.tsx");
    const b2bPage = read("app/(partner)/cabinet/catalog/page.tsx");
    const b2bFilters = read("src/modules/catalog/components/CatalogFilters.tsx");
    const publicCatalog = read("src/modules/public-retail/components/PublicRetailCatalog.tsx");

    expect(b2bCard).toContain("CatalogProductCardFrame");
    expect(publicCard).toContain("CatalogProductCardFrame");
    expect(b2bPage).toContain("CatalogToolbarFrame");
    expect(publicCatalog).toContain("CatalogToolbarFrame");
    expect(b2bFilters).toContain("CatalogFilterPanel");
    expect(publicCatalog).toContain("CatalogFilterPanel");
    expect(publicCatalog).toContain("CatalogFilterShell");
    expect(publicCatalog).toContain("CatalogProductGridFrame");
    expect(publicCatalog).toContain("NumberedPagination");
    expect(publicCatalog).toContain("CatalogFilterLink");
    expect(b2bFilters).toContain("CatalogTechnicalFacetGroups");
    expect(publicCatalog).toContain("CatalogTechnicalFacetGroups");
    expect(read("src/modules/public-retail/catalog-links.ts")).toContain("catalogFacetQueryFields");
    expect(read("src/modules/public-retail/catalog-links.ts")).toContain("updateCatalogFacetSelection");
    expect(read("app/catalog/page.tsx")).toContain("parseCatalogAttributeFilters");
    expect(read("app/catalog/page.tsx")).not.toContain('startsWith("facet_")');
    expect(publicCatalog).not.toContain('type="checkbox"');
    expect(publicCatalog).not.toContain('type="radio"');
  });

  it("keeps public retail commercial and cart boundaries separate", () => {
    const publicCard = read("src/modules/public-retail/components/PublicRetailProductCard.tsx");
    const publicCatalog = read("src/modules/public-retail/components/PublicRetailCatalog.tsx");

    expect(publicCard).toContain("PublicRetailAddToCartButton");
    expect(publicCard).not.toMatch(/ProductPricingBlock|ProductAvailabilityBlock|CatalogQuantityCartAction|commercialView|partnerPrice/);
    expect(publicCatalog).not.toMatch(/Supabase|from\(|listCatalogProductsAction|getPartnerWorkspaceContextAction/);
    expect(publicCard).toContain('density="compact"');
    expect(publicCard).toContain("square");
  });

  it("uses one governed public contact source in contacts and footer", () => {
    const contacts = read("app/contacts/page.tsx");
    const shell = read("src/modules/public-retail/components/PublicRetailShell.tsx");
    const content = read("src/modules/public-retail/public-company-content.ts");

    expect(contacts).toContain("publicCompanyContent.stores");
    expect(shell).toContain("publicCompanyContent.stores");
    expect(content).toContain("tel:+37379313353");
    expect(content).toContain("tel:+37378999495");
    expect(content).not.toContain("078999441");
    expect(content).toContain("google.com/maps/search");
  });
});
