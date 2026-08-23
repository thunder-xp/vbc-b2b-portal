import { describe, expect, it } from "vitest";

import { parsePublicSeoProducts } from "../seo-inventory";

describe("public SEO inventory", () => {
  it("keeps only safe published projection identifiers and deduplicates slugs", () => {
    const rows = [
      { slug: "camera-one", categoryPath: [{ slug: "cameras" }] },
      { slug: "camera-one", category_path: [] },
      { slug: "../../secret", category_path: [] },
    ];
    expect(parsePublicSeoProducts(rows)).toEqual([
      { slug: "camera-one", categoryPath: [{ slug: "cameras" }], lastModified: null },
    ]);
  });

  it("accepts only a trustworthy parseable publication timestamp", () => {
    const result = parsePublicSeoProducts([
      { slug: "camera-one", categoryPath: [], lastModified: "2026-08-23T12:00:00.000Z" },
      { slug: "camera-two", categoryPath: [], lastModified: "invalid" },
    ]);
    expect(result[0]?.lastModified?.toISOString()).toBe("2026-08-23T12:00:00.000Z");
    expect(result[1]?.lastModified).toBeNull();
  });

  it("excludes Project Equipment and every product beneath it", () => {
    expect(parsePublicSeoProducts([{
      slug: "project-device",
      categoryPath: [{ slug: "project-equipment" }],
    }])).toEqual([]);
  });
});
