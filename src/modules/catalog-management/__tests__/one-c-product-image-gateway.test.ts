import { describe, expect, it } from "vitest";

import {
  PRODUCT_IMAGE_PROPERTY_KEY,
  readProductImageUrl,
  withProductImageUrl,
} from "../one-c-product-image-gateway";

const url = "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fref%2Fhash.jpg?alt=media&token=test";

describe("1C product image additional requisite", () => {
  it("updates only the existing attribute value and preserves every unrelated field", () => {
    const source = [
      { LineNumber: 7, "Свойство_Key": PRODUCT_IMAGE_PROPERTY_KEY.toUpperCase(), "Значение": "old", "Значение_Type": "Edm.String", Extra: "keep" },
      { LineNumber: 2, "Свойство_Key": "11111111-1111-1111-1111-111111111111", "Значение": "other", Nested: { keep: true } },
    ];
    const result = withProductImageUrl(source, url);
    expect(result).toEqual([
      { ...source[0], "Значение": url },
      source[1],
    ]);
    expect(source[0]?.["Значение"]).toBe("old");
    expect(readProductImageUrl(result)).toBe(url);
  });

  it("appends the missing attribute using maximum numeric LineNumber plus one, including OData Int64 strings", () => {
    const source = [
      { LineNumber: 9, "Свойство_Key": "11111111-1111-1111-1111-111111111111", "Значение": "a" },
      { LineNumber: 3, "Свойство_Key": "22222222-2222-2222-2222-222222222222", "Значение": "b" },
      { LineNumber: "50", "Свойство_Key": "33333333-3333-3333-3333-333333333333", "Значение": "c" },
    ];
    expect(withProductImageUrl(source, url).at(-1)).toEqual({
      LineNumber: 51,
      "Свойство_Key": PRODUCT_IMAGE_PROPERTY_KEY,
      "Значение": url,
      "Значение_Type": "Edm.String",
      "ТекстоваяСтрока": "",
    });
  });

  it("handles an empty attribute array", () => {
    expect(withProductImageUrl([], url)).toEqual([{
      LineNumber: 1,
      "Свойство_Key": PRODUCT_IMAGE_PROPERTY_KEY,
      "Значение": url,
      "Значение_Type": "Edm.String",
      "ТекстоваяСтрока": "",
    }]);
  });
});
