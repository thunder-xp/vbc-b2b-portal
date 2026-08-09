import type { EstimateSectionSystemKey } from "../types";

export const CANONICAL_ESTIMATE_SECTIONS: ReadonlyArray<{
  key: EstimateSectionSystemKey;
  name: string;
  addLabel: string;
  subtotalLabel: string;
  defaultMode: "product" | "service";
  allowedModes: ReadonlyArray<"product" | "service" | "external">;
}> = [
  { key: "equipment", name: "Оборудование", addLabel: "Добавить оборудование", subtotalLabel: "Итого за оборудование", defaultMode: "product", allowedModes: ["product", "external"] },
  { key: "installation_materials", name: "Монтажные материалы", addLabel: "Добавить материалы", subtotalLabel: "Итого за монтажные материалы", defaultMode: "product", allowedModes: ["product", "external"] },
  { key: "installation_works", name: "Монтажные работы", addLabel: "Добавить вид работ", subtotalLabel: "Итого за монтажные работы", defaultMode: "service", allowedModes: ["service"] },
  { key: "commissioning_works", name: "Пусконаладочные работы", addLabel: "Добавить вид работ", subtotalLabel: "Итого за пусконаладочные работы", defaultMode: "service", allowedModes: ["service"] },
] as const;

export const CANONICAL_ESTIMATE_SECTION_BY_KEY = new Map(CANONICAL_ESTIMATE_SECTIONS.map((section) => [section.key, section]));

export function canonicalSectionOrder(key: EstimateSectionSystemKey | null): number {
  if (!key) return CANONICAL_ESTIMATE_SECTIONS.length;
  return CANONICAL_ESTIMATE_SECTIONS.findIndex((section) => section.key === key);
}
