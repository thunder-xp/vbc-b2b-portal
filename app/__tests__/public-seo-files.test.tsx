import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("public SEO route wiring", () => {
  it("builds the sitemap from one bounded published-projection read", () => {
    const inventory = read("src/modules/public-retail/seo-inventory.ts");
    expect(inventory.match(/\.rpc\("list_public_retail_sitemap_inventory"\)/g)).toHaveLength(1);
    expect(inventory).toContain("createPublicReadClient");
    expect(inventory).not.toContain("createAdminClient");
    expect(inventory).not.toContain("external_1c");
    expect(inventory).not.toContain("retail_price");
  });

  it("keeps private and tokenized routes out of discovery", () => {
    const robots = read("app/robots.ts");
    for (const path of ["/admin/", "/api/", "/auth/", "/cabinet/", "/checkout", "/onboarding/", "/order/", "/proposal/"]) {
      expect(robots).toContain(`\"${path}\"`);
    }
    expect(read("app/(partner)/cabinet/layout.tsx")).toContain("index: false");
    expect(read("app/(admin)/admin/layout.tsx")).toContain("index: false");
    expect(read("app/auth/layout.tsx")).toContain("index: false");
    expect(read("app/(partner)/onboarding/layout.tsx")).toContain("index: false");
  });

  it("uses structured data without private commercial fields", () => {
    const productPage = read("app/products/[slug]/page.tsx");
    const seo = read("src/modules/public-retail/seo.ts");
    expect(productPage).toContain("publicProductSchema(product, locale)");
    expect(seo).toContain('"@type": "Product"');
    expect(seo).toContain('"@type": "Offer"');
    expect(`${productPage}\n${seo}`).not.toMatch(/partnerPrice|purchasePrice|margin|external1c/i);
  });
});
