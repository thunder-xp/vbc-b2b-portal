import { describe, expect, it } from "vitest";

import {
  buildPublicMetadata,
  hasCalculatorState,
  publicCatalogSeoState,
  publicLocalizedUrl,
  publicArticleSchema,
  publicInstallationServiceSchema,
  publicOrganizationSchemas,
  publicProductSchema,
} from "../seo";
import type { PublicRetailProductDetailDto } from "../types";

describe("public SEO contract", () => {
  it("creates distinct RU/RO canonicals and reciprocal hreflang", () => {
    const metadata = buildPublicMetadata({
      locale: "ro",
      path: "/contacts",
      title: "Contacte | Novotech",
      description: "Contacte Novotech.",
    });

    expect(metadata.alternates?.canonical).toBe("https://www.nsd.md/contacts?lang=ro");
    expect(metadata.alternates?.languages).toEqual({
      ru: "https://www.nsd.md/contacts?lang=ru",
      ro: "https://www.nsd.md/contacts?lang=ro",
      "x-default": "https://www.nsd.md/contacts?lang=ru",
    });
    expect(metadata.openGraph).toMatchObject({ locale: "ro_MD", alternateLocale: ["ru_MD"] });
  });

  it("keeps clean category pagination indexable", () => {
    expect(publicCatalogSeoState(
      { lang: "ru", category: "cameras", page: "2" },
      new Set(["cameras"]),
    )).toEqual({
      categorySlug: "cameras",
      page: 2,
      index: true,
      canonicalParams: { category: "cameras", page: 2 },
    });
  });

  it("noindexes search, facets, sort and noncanonical views", () => {
    for (const params of [
      { q: "camera" },
      { availability: "in_stock" },
      { sort: "price_asc" },
      { view: "special" },
      { "attr.resolution": "4 MP" },
    ]) {
      expect(publicCatalogSeoState(params, new Set()).index).toBe(false);
    }
  });

  it("does not canonicalize an invalid or excluded category", () => {
    const state = publicCatalogSeoState({ category: "project-equipment" }, new Set(["cameras"]));
    expect(state.index).toBe(false);
    expect(state.canonicalParams.category).toBeUndefined();
  });

  it("canonicalizes calculator state to the localized base tool", () => {
    expect(hasCalculatorState({ lang: "ru" })).toBe(false);
    expect(hasCalculatorState({ lang: "ru", object: "warehouse" })).toBe(true);
    expect(publicLocalizedUrl("/calculator/cctv", "ru")).toBe("https://www.nsd.md/calculator/cctv?lang=ru");
  });

  it("builds RETAIL-only Product offers from the visible DTO", () => {
    const product = {
      id: "10000000-0000-4000-8000-000000000001",
      slug: "camera-one",
      sku: "CAM-1",
      name: "Camera One",
      shortDescription: "Public camera",
      description: null,
      image: { url: "https://example.com/camera.webp", alt: "Camera One" },
      gallery: [],
      brand: { slug: "dahua", name: "Dahua" },
      category: { slug: "cameras", name: "Камеры" },
      categoryPath: [{ id: "20000000-0000-4000-8000-000000000001", slug: "cameras", name: "Камеры" }],
      price: { amount: 1250, currency: "MDL", vatPresentation: "included" },
      availability: "in_stock",
      highlights: [],
      specifications: [],
      calculatorEligible: true,
      datasheet: null,
    } satisfies PublicRetailProductDetailDto;

    const schema = publicProductSchema(product, "ru");
    expect(schema.offers).toEqual(expect.objectContaining({
      price: "1250.00",
      priceCurrency: "MDL",
      availability: "https://schema.org/InStock",
    }));
    expect(JSON.stringify(schema)).not.toMatch(/partner|purchase|margin|warehouse|external_1c/i);
  });

  it("uses only governed organization and store facts", () => {
    const serialized = JSON.stringify(publicOrganizationSchemas("ro", true));
    expect(serialized).toContain("+37379313353");
    expect(serialized).toContain("+37378999495");
    expect(serialized).toContain("str. Lev Tolstoi 4");
    expect(serialized).not.toMatch(/latitude|longitude|vat|registration/i);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });

  it("builds factual service and authored article schema without fabricated ratings", () => {
    const service = publicInstallationServiceSchema("ru");
    const article = publicArticleSchema({
      locale: "ro",
      path: "/guides/cctv-selection",
      title: "Ghid CCTV",
      description: "Ghid practic.",
    });

    expect(service).toMatchObject({ "@type": "Service", areaServed: { name: "Moldova" } });
    expect(article).toMatchObject({ "@type": "Article", inLanguage: "ro" });
    expect(JSON.stringify([service, article])).not.toMatch(/aggregateRating|review|priceRange/);
  });
});
