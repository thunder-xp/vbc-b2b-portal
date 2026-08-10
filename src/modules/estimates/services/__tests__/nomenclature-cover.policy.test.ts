import { describe, expect, it } from "vitest";

import { nomenclatureCoverFileError } from "../nomenclature-cover.policy";

describe("nomenclature cover transport policy", () => {
  it("accepts supported images within the source limit", () => {
    expect(nomenclatureCoverFileError({ size: 2 * 1024 * 1024, type: "image/jpeg" })).toBeNull();
    expect(nomenclatureCoverFileError({ size: 512, type: "image/png" })).toBeNull();
    expect(nomenclatureCoverFileError({ size: 512, type: "image/webp" })).toBeNull();
  });

  it("rejects oversized and unsupported files before server-action transport", () => {
    expect(nomenclatureCoverFileError({ size: 2 * 1024 * 1024 + 1, type: "image/png" })).toBe("Размер файла не должен превышать 2 МБ.");
    expect(nomenclatureCoverFileError({ size: 100, type: "image/svg+xml" })).toBe("Используйте корректное JPG, PNG или WebP изображение.");
  });
});
