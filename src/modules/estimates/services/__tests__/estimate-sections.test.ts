import { describe, expect, it } from "vitest";

import { buildCanonicalEstimateSectionPresentation, CANONICAL_ESTIMATE_SECTIONS, resolveCanonicalLineSectionKey } from "../estimate-sections";

describe("estimate canonical section presentation", () => {
  it("keeps the exact four business sections in order", () => {
    expect(CANONICAL_ESTIMATE_SECTIONS.map((section) => section.name)).toEqual([
      "Оборудование",
      "Монтажные материалы",
      "Монтажные работы",
      "Пусконаладочные работы",
    ]);
  });

  it("respects governed and exact-name section identity", () => {
    expect(resolveCanonicalLineSectionKey("product", { name: "Legacy", systemKey: "installation_materials" })).toBe("installation_materials");
    expect(resolveCanonicalLineSectionKey("service", { name: "Пусконаладочные работы", systemKey: null })).toBe("commissioning_works");
  });

  it("projects unmapped legacy lines without guessing product identity", () => {
    expect(resolveCanonicalLineSectionKey("service", { name: "Оборудование и услуги", systemKey: null })).toBe("installation_works");
    expect(resolveCanonicalLineSectionKey("product", { name: "Оборудование и услуги", systemKey: null })).toBe("equipment");
    expect(resolveCanonicalLineSectionKey("external", null)).toBe("equipment");
  });

  it("allocates a discounted legacy section total across canonical groups", () => {
    const projection = buildCanonicalEstimateSectionPresentation({
      sections: [{ id: "legacy", name: "Оборудование и услуги", systemKey: null }],
      lines: [
        { id: "product", sectionId: "legacy", lineType: "product" as const },
        { id: "service", sectionId: "legacy", lineType: "service" as const },
      ],
      calculatedLines: [{ id: "product", lineTotal: 100 }, { id: "service", lineTotal: 50 }],
      sectionTotals: [{ id: "legacy", total: 135 }],
    });
    expect(projection.find((section) => section.config.key === "equipment")?.total).toBe(90);
    expect(projection.find((section) => section.config.key === "installation_works")?.total).toBe(45);
  });
});
