import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUPPORTED_PARTNER_ROUTE_AREAS } from "@/src/modules/partner-locale";

const root = process.cwd();
const cabinetRoot = path.join(root, "app", "(partner)", "cabinet");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

function collectPageFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectPageFiles(absolute);
    return entry.name === "page.tsx" ? [absolute] : [];
  });
}

describe("Partner Cabinet visual standard", () => {
  it("audits every governed Partner Cabinet route family", () => {
    const pages = collectPageFiles(cabinetRoot);
    const routeAreas = new Set(
      pages
        .map((file) => path.relative(cabinetRoot, file).split(path.sep)[0]!)
        .filter((area) => area !== "page.tsx"),
    );

    expect(pages).toHaveLength(65);
    expect([...routeAreas].sort()).toEqual([...SUPPORTED_PARTNER_ROUTE_AREAS].sort());
  });

  it("governs every route-level title header through the compact shared rule", () => {
    const ungoverned = collectPageFiles(cabinetRoot).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      const headers = [...source.matchAll(/<header\b([^>]*)>([\s\S]*?)<\/header>/g)];
      return headers.some((match) => match[2]?.includes("<h1") && !match[1]?.includes("data-partner-page-header"))
        ? [path.relative(root, file)]
        : [];
    });

    expect(ungoverned).toEqual([]);
    const css = read("app/globals.css");
    expect(css).toContain("[data-partner-page-header] h1");
    expect(css).toContain("[data-partner-page-header] p");
  });

  it("inherits the global Inter font and tabular numerals in the Partner Cabinet", () => {
    const rootLayout = read("app/layout.tsx");
    const partnerLayout = read("src/modules/partner-cabinet/components/PartnerLayout.tsx");
    const globalCss = read("app/globals.css");
    expect(rootLayout).toContain("Inter");
    expect(rootLayout).toContain('subsets: ["cyrillic", "latin"]');
    expect(rootLayout).not.toContain("IBM_Plex_Sans");
    expect(partnerLayout).not.toContain("font-partner-cabinet");
    expect(partnerLayout).not.toContain("data-partner-font");
    expect(globalCss).toContain("font-variant-numeric: tabular-nums");
  });

  it("keeps important page actions while removing their redundant visual title blocks", () => {
    const estimates = read("app/(partner)/cabinet/estimates/page.tsx");
    const support = read("app/(partner)/cabinet/support/page.tsx");
    expect(estimates).toContain('href="/cabinet/estimates/new"');
    expect(estimates).toContain("data-partner-page-header");
    expect(support).toContain('href="/cabinet/support/new"');
    expect(support).toContain("data-partner-page-header");
  });
});
