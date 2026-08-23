import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSitemap } from "next/dist/build/webpack/loaders/metadata/resolve-route-data";

const { listPublicSeoProducts } = vi.hoisted(() => ({
  listPublicSeoProducts: vi.fn(),
}));
vi.mock("@/src/modules/public-retail/seo-inventory", () => ({ listPublicSeoProducts }));

import sitemap from "../sitemap";

describe("public sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPublicSeoProducts.mockResolvedValue([
      { slug: "camera-one", categoryPath: [{ slug: "cameras" }], lastModified: new Date("2026-08-23T12:00:00.000Z") },
    ]);
  });

  it("uses only authoritative publication lastmod and omits priority/change frequency", async () => {
    const entries = await sitemap();
    const product = entries.find((entry) => entry.url.includes("/products/camera-one?lang=ru"));
    const home = entries.find((entry) => entry.url === "https://www.nsd.md/?lang=ru");
    expect(product?.lastModified).toEqual(new Date("2026-08-23T12:00:00.000Z"));
    expect(home?.lastModified).toBeUndefined();
    expect(entries.every((entry) => entry.priority === undefined && entry.changeFrequency === undefined)).toBe(true);
  });

  it("contains only localized canonical public routes", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("https://www.nsd.md/?lang=ru");
    expect(urls).toContain("https://www.nsd.md/?lang=ro");
    expect(urls).toContain("https://www.nsd.md/catalog?lang=ru&amp;category=cameras");
    expect(urls).toContain("https://www.nsd.md/products/camera-one?lang=ro");
    expect(urls.every((url) => url.startsWith("https://www.nsd.md/"))).toBe(true);
    expect(urls.join("\n")).not.toMatch(/cart|checkout|cabinet|admin|search|sort|view|project-equipment/);
    expect(urls.join("\n")).not.toMatch(/http:\/\/|https:\/\/nsd\.md/);
    expect(listPublicSeoProducts).toHaveBeenCalledTimes(1);
  });

  it("serializes category query URLs as valid XML", async () => {
    const xml = resolveSitemap(await sitemap());

    expect(xml).toContain("?lang=ru&amp;category=cameras");
    expect(xml).not.toContain("?lang=ru&category=cameras");
  });
});
