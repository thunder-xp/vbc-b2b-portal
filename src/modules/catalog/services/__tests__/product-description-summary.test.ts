import { describe, expect, it } from "vitest";

import { deriveProductDescriptionSummary, isDefaultProductDescription } from "../product-description-summary";

describe("deriveProductDescriptionSummary", () => {
  it("cuts rich text before the governed characteristics heading", () => {
    expect(deriveProductDescriptionSummary(
      "<p>Первая фраза.</p><p>Вторая фраза.</p><h3>  основные   характеристики и преимущества: </h3><ul><li>Не включать</li></ul>",
      null,
    )).toBe("Первая фраза. Вторая фраза.");
  });

  it("removes citation artifacts and stops before non-intro product sections", () => {
    expect(deriveProductDescriptionSummary(
      "Камера подходит для офиса[cite: 20]. Вторая вводная фраза [source: catalog]. КЛЮЧЕВЫЕ ПРЕИМУЩЕСТВА: - Не включать",
      null,
    )).toBe("Камера подходит для офиса. Вторая вводная фраза.");
  });

  it("keeps at most five meaningful sentences and stays bounded", () => {
    const result = deriveProductDescriptionSummary(
      "Раз. Два предложения. Три предложения. Четыре предложения. Пять предложений. Шесть предложений.",
      null,
    );
    expect(result).toBe("Раз. Два предложения. Три предложения. Четыре предложения. Пять предложений.");
    expect(result.length).toBeLessThanOrEqual(501);
  });

  it("uses the bounded fallback when the PDP description is empty", () => {
    expect(deriveProductDescriptionSummary(null, "Краткое описание товара.")).toBe("Краткое описание товара.");
  });

  it("recognizes only a normalized legacy product-name description", () => {
    expect(isDefaultProductDescription("  Camera   X  ", "Camera X")).toBe(true);
    expect(isDefaultProductDescription("Camera X - customer note", "Camera X")).toBe(false);
  });
});
