import { describe, expect, it } from "vitest";

import {
  buildPublicCategoryContent,
  needsPublicProductFallback,
  publicProductMetaDescription,
  resolvePublicProductDescription,
  sanitizePublicContentText,
} from "../content";
import type { PublicRetailCategoryDto, PublicRetailProductDetailDto } from "../types";

const root: PublicRetailCategoryDto = {
  id: "10000000-0000-4000-8000-000000000001",
  parentId: null,
  slug: "video",
  name: "Видеонаблюдение",
  description: null,
  productCount: 12,
};
const leaf: PublicRetailCategoryDto = {
  id: "10000000-0000-4000-8000-000000000002",
  parentId: root.id,
  slug: "ip-cameras",
  name: "IP-камеры",
  description: null,
  productCount: 8,
};

const product = {
  name: "DHI-CAMERA-4MP",
  sku: "CAM-4",
  shortDescription: null,
  description: null,
  categoryPath: [{ id: leaf.id, slug: leaf.slug, name: leaf.name }],
  specifications: [
    { key: "resolution", label: "Разрешение-MPx", value: "4 MP", filterable: true },
    { key: "micro-sd", label: "MicroSD", value: "256 GB", filterable: true },
  ],
} satisfies Pick<PublicRetailProductDetailDto, "name" | "sku" | "shortDescription" | "description" | "categoryPath" | "specifications">;

describe("public SEO content", () => {
  it("preserves authored and governed category content before deterministic fallback", () => {
    const authored = buildPublicCategoryContent({
      category: leaf,
      categories: [root, leaf],
      facets: [],
      locale: "ru",
      authoredDescription: "Авторское описание категории с проверенным и полезным содержанием для покупателя.",
    });
    const governed = buildPublicCategoryContent({
      category: { ...leaf, description: "Управляемое описание категории из текущей публичной проекции Novotech." },
      categories: [root, leaf],
      facets: [],
      locale: "ru",
    });

    expect(authored.source).toBe("authored");
    expect(authored.intro).toContain("Авторское описание");
    expect(governed.source).toBe("governed");
    expect(governed.intro).toContain("Управляемое описание");
  });

  it("uses only actual high-coverage facets in separate RU and RO templates", () => {
    const facets = [
      { key: "resolution", label: "Разрешение-MPx", values: [{ value: "4 MP", count: 8 }], coverage: 8 },
      { key: "micro-sd", label: "MicroSD", values: [{ value: "256 GB", count: 6 }], coverage: 6 },
    ];
    const ru = buildPublicCategoryContent({ category: leaf, categories: [root, leaf], facets, locale: "ru" });
    const ro = buildPublicCategoryContent({ category: leaf, categories: [root, leaf], facets, locale: "ro" });

    expect(ru.intro).toContain("Разрешение-MPx");
    expect(ro.intro).toContain("Rezoluție MPx");
    expect(ro.intro).toContain("MicroSD");
    expect(`${ru.intro} ${ro.intro}`).not.toMatch(/гарант|livrare gratuit|certificat/i);
  });

  it("creates factual product fallback from identity and governed specifications only", () => {
    const ru = resolvePublicProductDescription(product, "ru");
    const ro = resolvePublicProductDescription(product, "ro");

    expect(ru).toMatchObject({ source: "fallback" });
    expect(ru.text).toContain("CAM-4");
    expect(ru.text).toContain("Разрешение-MPx: 4 MP");
    expect(ro.text).toContain("Rezoluție MPx: 4 MP");
    expect(`${ru.text} ${ro.text}`).not.toMatch(/GTIN|MPN|гарант|livrare|stoc|brand/i);
    expect(needsPublicProductFallback(product)).toBe(true);
  });

  it("does not replace substantial governed product descriptions", () => {
    const governed = {
      ...product,
      description: "Подробное управляемое описание модели, которое уже объясняет назначение и подтвержденные характеристики.",
    };
    expect(resolvePublicProductDescription(governed, "ru")).toEqual({
      source: "governed",
      text: governed.description,
    });
    expect(needsPublicProductFallback(governed)).toBe(false);
  });

  it("removes legacy source citation tokens without changing governed content", () => {
    const governed = {
      ...product,
      description: "DHI-CAMERA-4MP is a governed camera description [cite: 5] with verified technical details.",
    };

    expect(resolvePublicProductDescription(governed, "ru")).toEqual({
      source: "governed",
      text: "DHI-CAMERA-4MP is a governed camera description with verified technical details.",
    });
    expect(sanitizePublicContentText("Fact one [cite: 2, 4]. Fact two.")).toBe("Fact one. Fact two.");
  });

  it("keeps fallback metadata concise and product-specific", () => {
    const first = publicProductMetaDescription(product, "ru");
    const second = publicProductMetaDescription({ ...product, sku: "CAM-5", name: "DHI-CAMERA-5MP" }, "ru");
    expect(first.length).toBeLessThanOrEqual(158);
    expect(first).not.toBe(second);
  });
});
