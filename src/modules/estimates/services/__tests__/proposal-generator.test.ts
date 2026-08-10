import { describe, expect, it } from "vitest";

import { GENERATOR_SECTIONS, countGeneratorResolutions, generateRequirements } from "../proposal-generator";

describe("proposal generator deterministic extraction", () => {
  it("uses the four canonical sections without inventing commercial identity", () => {
    expect(GENERATOR_SECTIONS.map((section) => section.key)).toEqual(["equipment", "installation_materials", "installation_works", "commissioning_works"]);
    const result = generateRequirements("12 камер внутри, 4 камеры снаружи, кабель 200 м, монтаж камер, настройка системы");
    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({ quantity: 12, sectionKey: "equipment", resolution: "unresolved", resolvedId: null });
    expect(result.find((line) => line.description.includes("кабель"))).toMatchObject({ sectionKey: "installation_materials", unit: "meter" });
    expect(result.find((line) => line.description.includes("монтаж"))).toMatchObject({ sectionKey: "installation_works" });
    expect(result.find((line) => line.description.includes("настройка"))).toMatchObject({ sectionKey: "commissioning_works" });
    expect(result.every((line) => line.resolvedLabel === null)).toBe(true);
  });

  it("bounds requirement count and reports resolution facts", () => {
    const result = generateRequirements(Array.from({ length: 40 }, (_, index) => `позиция ${index + 1}`).join(","));
    expect(result).toHaveLength(30);
    result[0].resolution = "catalog";
    result[1].resolution = "own_nomenclature";
    result[2].resolution = "shared_nomenclature";
    expect(countGeneratorResolutions(result)).toEqual({
      catalog: 1,
      service: 0,
      own: 1,
      shared: 1,
      unresolved: 27,
    });
  });
});
