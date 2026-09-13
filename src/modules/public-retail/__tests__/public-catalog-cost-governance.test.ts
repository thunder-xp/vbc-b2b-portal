import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isValidPublicCatalogRequest, publicCatalogDailyRotationSeed } from "../public-catalog-request";

describe("public catalog cost governance", () => {
  it("accepts bounded public filters and rejects invalid facets before a read", () => {
    const key = "attr.property_11111111-1111-4111-8111-111111111111";
    expect(isValidPublicCatalogRequest({ lang: "ro", category: "video", [key]: "alb,negru", page: "2" })).toBe(true);
    expect(isValidPublicCatalogRequest({ "attr.bad": "value" })).toBe(false);
    expect(isValidPublicCatalogRequest({ [key]: Array.from({ length: 11 }, (_, index) => `value-${index}`).join(",") })).toBe(false);
    expect(isValidPublicCatalogRequest({ [key]: "11111111-1111-4111-8111-111111111111" })).toBe(false);
    expect(isValidPublicCatalogRequest({ q: "a".repeat(101) })).toBe(false);
    expect(isValidPublicCatalogRequest({ page: "210" })).toBe(false);
    expect(isValidPublicCatalogRequest({ lang: ["ru", "ro"] })).toBe(false);
  });

  it("uses one anonymous seed per UTC day without a browser cookie", () => {
    const first = publicCatalogDailyRotationSeed(new Date("2026-09-13T00:00:00Z"));
    expect(first).toBe(publicCatalogDailyRotationSeed(new Date("2026-09-13T23:59:59Z")));
    expect(first).not.toBe(publicCatalogDailyRotationSeed(new Date("2026-09-14T00:00:00Z")));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("caches only public projection service results and rejects invalid input before catalog reads", () => {
    const server = source("src/modules/public-retail/server.ts");
    const page = source("app/catalog/page.tsx");
    expect(server).toContain("unstable_cache");
    expect(server).toContain('"public-retail-publication"');
    expect(server).toContain("SupabasePublicRetailReadRepository");
    expect(server).not.toContain("createAdminClient");
    expect(server).not.toContain("getPartnerWorkspaceContext");
    expect(page.indexOf("if (!isValidPublicCatalogRequest(params))")).toBeLessThan(page.indexOf("const canonicalHref"));
    expect(page).not.toContain("x-novotech-popular-session");
    expect(page).toContain("deferCartSummary");
  });
});

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}
