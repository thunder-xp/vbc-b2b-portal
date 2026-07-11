import { describe, expect, it } from "vitest";
import { resolveCategoryFilters } from "../catalog-configuration";

describe("catalog category filter configuration", () => {
  it("returns only the selected category definitions and respects hidden attributes", () => {
    const cameraFilters = [
      { code: "resolution", label: "Разрешение", kind: "multi_select" as const, primary: true },
      { code: "focal_length", label: "Фокусное расстояние", kind: "number_range" as const, primary: false },
    ];
    const recorderFilters = [{ code: "channels", label: "Каналы", kind: "multi_select" as const, primary: true }];
    const result = resolveCategoryFilters("camera", {
      categoryFilters: { camera: cameraFilters, recorder: recorderFilters },
      hiddenAttributeCodes: new Set(["focal_length"]),
    });
    expect(result).toEqual([cameraFilters[0]]);
    expect(result).not.toContainEqual(recorderFilters[0]);
  });
});
