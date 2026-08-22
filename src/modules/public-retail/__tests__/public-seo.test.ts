import { describe, expect, it } from "vitest";

import {
  buildPublicMetadata,
  hasCalculatorState,
  publicCatalogSeoState,
  publicLocalizedUrl,
  publicArticleSchema,
  publicInstallationServiceSchema,
  publicOrganizationSchemas,
  publicCategorySeoDescription,
  publicMerchantProductImageUrls,
  publicProductSchema,
  publicProductSeoDescription,
} from "../seo";
import type { PublicRetailProductDetailDto } from "../types";

describe("public SEO contract", () => {
  const product = {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "camera-one",
    sku: "CAM-1",
    name: "Camera One",
    shortDescription: "Public camera",
    description: null,
    image: { url: "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fcamera.webp?alt=media&token=governed", alt: "Camera One" },
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

  it("keeps localized product and category descriptions useful and bounded", () => {
    const shortProduct = publicProductSeoDescription("Camera X", "Cameră IP", "ro");
    const shortCategory = publicCategorySeoDescription("Camere IP", "Echipamente CCTV.", "ro");
    const longProduct = publicProductSeoDescription("Camera X", "x".repeat(200), "ru");

    expect(shortProduct).toContain("Camera X");
    expect(shortProduct).toContain("Moldova");
    expect(shortCategory).toContain("Camere IP");
    expect(shortCategory).toContain("Novotech");
    expect([...longProduct]).toHaveLength(156);
  });

  it("builds RETAIL-only Product offers from the visible DTO", () => {
    const schema = publicProductSchema(product, "ru");
    expect(schema?.image).toEqual([product.image.url]);
    expect(schema?.offers).toEqual(expect.objectContaining({
      price: "1250.00",
      priceCurrency: "MDL",
      availability: "https://schema.org/InStock",
    }));
    expect(JSON.stringify(schema)).not.toMatch(/partner|purchase|margin|warehouse|external_1c/i);
  });

  it("emits known availability and omits unknown availability", () => {
    const lowStock = publicProductSchema({ ...product, availability: "low_stock" }, "ru");
    const unknown = publicProductSchema({ ...product, availability: "unknown" }, "ru");

    expect(lowStock?.offers).toEqual(expect.objectContaining({
      availability: "https://schema.org/LimitedAvailability",
    }));
    expect(unknown?.offers).not.toHaveProperty("availability");
  });

  it("uses the localized public category path and omits internal category buckets", () => {
    const localized = publicProductSchema({
      ...product,
      categoryPath: [
        { id: "20000000-0000-4000-8000-000000000001", slug: "security", name: "Sisteme de securitate" },
        { id: "20000000-0000-4000-8000-000000000002", slug: "cameras", name: "Camere" },
      ],
    }, "ro");
    const internal = publicProductSchema({
      ...product,
      categoryPath: [{
        id: "20000000-0000-4000-8000-000000000003",
        slug: "project-equipment-a7bad0fc",
        name: "-PROJECT EQUIPMENT-",
      }],
    }, "ru");

    expect(localized?.category).toBe("Sisteme de securitate > Camere");
    expect(internal).not.toHaveProperty("category");
    expect(JSON.stringify(internal)).not.toMatch(/PROJECT EQUIPMENT|20000000-0000-4000-8000-000000000003/);
  });

  it("emits governed brand only and does not fabricate product identifiers or policies", () => {
    const governedBrand = publicProductSchema(product, "ru");
    const noBrand = publicProductSchema({ ...product, brand: null }, "ru");

    expect(governedBrand?.brand).toEqual({ "@type": "Brand", name: "Dahua" });
    expect(noBrand).not.toHaveProperty("brand");
    expect(governedBrand).not.toHaveProperty("gtin");
    expect(governedBrand).not.toHaveProperty("mpn");
    expect(governedBrand?.offers).not.toHaveProperty("shippingDetails");
    expect(governedBrand?.offers).not.toHaveProperty("hasMerchantReturnPolicy");
  });

  it("emits all governed gallery images as stable absolute URLs", () => {
    const gallery = [
      { url: "/products/camera-front.webp", alt: "Front" },
      { url: "https://storage.googleapis.com/novotech-systems-5449b.appspot.com/products/camera-side.webp", alt: "Side" },
    ];
    const schema = publicProductSchema({ ...product, gallery }, "ru");

    expect(schema?.image).toEqual([
      "https://www.nsd.md/products/camera-front.webp",
      gallery[1].url,
    ]);
  });

  it("omits merchant Product and Offer schema without a governed real image", () => {
    expect(publicProductSchema({ ...product, image: null }, "ru")).toBeNull();
    expect(publicProductSchema({ ...product, image: { url: "/product-placeholder.svg", alt: "Fallback" } }, "ru")).toBeNull();
  });

  it("rejects malformed, non-HTTPS, private and transient optimization images", () => {
    for (const url of [
      "http://storage.googleapis.com/novotech-systems-5449b.appspot.com/camera.webp",
      "https://example.com/private-camera.webp",
      "https://www.nsd.md/_next/image?url=%2Fcamera.webp&w=640&q=75",
      "blob:https://www.nsd.md/camera",
      "not-a-url",
    ]) {
      expect(publicMerchantProductImageUrls({ ...product, image: { url, alt: "Camera" } })).toEqual([]);
    }
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
