import { describe, expect, it } from "vitest";

import type { CatalogProductCardDto } from "../catalog.service";
import { buildCatalogComparisonMatrix } from "../catalog-comparison";

describe("catalog comparison matrix", () => {
  it("normalizes heterogeneous characteristics and marks differences", () => {
    const matrix = buildCatalogComparisonMatrix([
      product("one", [
        { key: "resolution", label: "Разрешение", value: "4 Мп" },
        { label: "Питание", value: "12 В" },
        { label: "Питание", value: "duplicate ignored" },
      ]),
      product("two", [
        { key: "resolution", label: "Разрешение", value: "8 Мп" },
        { label: "Материал", value: "Металл" },
      ]),
    ]);

    expect(matrix).toEqual([
      {
        key: "label:материал",
        label: "Материал",
        values: ["—", "Металл"],
        differs: true,
      },
      {
        key: "label:питание",
        label: "Питание",
        values: ["12 В", "—"],
        differs: true,
      },
      {
        key: "resolution",
        label: "Разрешение",
        values: ["4 Мп", "8 Мп"],
        differs: true,
      },
    ]);
  });

  it("keeps one deterministic value for duplicate characteristic names", () => {
    const matrix = buildCatalogComparisonMatrix([
      product("one", [
        { label: "Материал", value: "Металл" },
        { label: "материал", value: "Пластик" },
      ]),
    ]);

    expect(matrix).toEqual([{
      key: "label:материал",
      label: "Материал",
      values: ["Металл"],
      differs: false,
    }]);
  });
});

function product(
  id: string,
  keyCharacteristics: CatalogProductCardDto["keyCharacteristics"],
): CatalogProductCardDto {
  return {
    id,
    sku: id,
    name: id,
    slug: id,
    shortDescription: null,
    imageUrl: null,
    brand: null,
    category: null,
    keyCharacteristics,
    datasheet: null,
  };
}
