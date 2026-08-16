import { beforeEach, describe, expect, it, vi } from "vitest";

const { listPublicSeoProducts } = vi.hoisted(() => ({
  listPublicSeoProducts: vi.fn(),
}));
vi.mock("@/src/modules/public-retail/seo-inventory", () => ({ listPublicSeoProducts }));

import sitemap from "../sitemap";

describe("public sitemap", () => {
  beforeEach(() => {
    listPublicSeoProducts.mockResolvedValue([
      { slug: "camera-one", categoryPath: [{ slug: "cameras" }] },
    ]);
  });

  it("contains only localized canonical public routes", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("https://www.nsd.md/?lang=ru");
    expect(urls).toContain("https://www.nsd.md/?lang=ro");
    expect(urls).toContain("https://www.nsd.md/catalog?lang=ru&category=cameras");
    expect(urls).toContain("https://www.nsd.md/products/camera-one?lang=ro");
    expect(urls.join("\n")).not.toMatch(/cart|checkout|cabinet|admin|search|sort|view|project-equipment/);
    expect(listPublicSeoProducts).toHaveBeenCalledTimes(1);
  });
});
