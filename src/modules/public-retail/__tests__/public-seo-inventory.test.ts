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
      { slug: "camera-one", categoryPath: [{ slug: "cameras" }] },
    ]);
  });

  it("excludes Project Equipment and every product beneath it", () => {
    expect(parsePublicSeoProducts([{
      slug: "project-device",
      categoryPath: [{ slug: "project-equipment" }],
    }])).toEqual([]);
  });
});
