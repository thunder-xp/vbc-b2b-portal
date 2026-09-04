import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globals = source("app/globals.css");
const shell = source("src/modules/public-retail/components/PublicRetailShell.tsx");
const showcase = source("src/modules/public-retail/components/PublicRetailShowcase.tsx");
const catalog = source("src/modules/public-retail/components/PublicRetailCatalog.tsx");

describe("public retail FullHD and 4K parity", () => {
  it("uses one bounded public shell contract", () => {
    expect(globals).toContain("--public-retail-shell-max-width: 90rem");
    expect(globals).toContain("--public-retail-catalog-sidebar-width: 16.25rem");
    expect(globals).toContain("--public-retail-product-grid-gap: 0.75rem");
    expect(shell.match(/public-retail-container/g)).toHaveLength(3);
    expect(showcase).toContain('className="public-retail-container');
    expect(catalog).toContain('className="public-retail-container');
  });

  it("fixes public wide-screen product grids at exactly five columns", () => {
    expect(globals).toContain("@media (min-width: 120rem)");
    expect(globals).toContain(".public-retail .public-retail-product-grid");
    expect(globals).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(showcase).toContain('<CatalogProductGridFrame className="public-retail-product-grid">');
    expect(catalog).toContain('<CatalogProductGridFrame className="public-retail-product-grid">');
  });

  it("keeps the public catalog sidebar stable without layout JavaScript", () => {
    expect(catalog).toContain("lg:grid-cols-[var(--public-retail-catalog-sidebar-width)_minmax(0,1fr)]");
    expect(globals).not.toContain("zoom:");
    expect(globals).not.toContain("transform: scale(");
    expect(showcase).not.toContain("resize");
    expect(catalog).not.toContain("resize");
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}
