import { describe, expect, it } from "vitest";

import { canonicalEstimateWorkName } from "../../estimate-work-labels";
import { estimateWorkNameForLocale } from "../../../partner-locale";

describe("estimate work labels", () => {
  it("normalizes legacy persisted work names to the approved canonical wording", () => {
    expect(canonicalEstimateWorkName("Монтаж видеокамеры")).toBe("Монтаж оборудования");
    expect(canonicalEstimateWorkName("Прокладка кабеля")).toBe("Трассировка кабеля");
  });

  it("renders the approved work names in RU and RO", () => {
    expect(estimateWorkNameForLocale("Монтаж оборудования", "ru")).toBe("Монтаж оборудования");
    expect(estimateWorkNameForLocale("Трассировка кабеля", "ru")).toBe("Трассировка кабеля");
    expect(estimateWorkNameForLocale("Монтаж оборудования", "ro")).toBe("Montajul echipamentului");
    expect(estimateWorkNameForLocale("Трассировка кабеля", "ro")).toBe("Trasarea cablului");
  });
});
