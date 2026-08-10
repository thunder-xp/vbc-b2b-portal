import type { EstimateSectionSystemKey, EstimateUnit } from "../types";

export const GENERATOR_SECTIONS = [
  { key: "equipment", label: "Оборудование" },
  { key: "installation_materials", label: "Монтажные материалы" },
  { key: "installation_works", label: "Монтажные работы" },
  { key: "commissioning_works", label: "Пусконаладочные работы" },
] as const satisfies ReadonlyArray<{ key: EstimateSectionSystemKey; label: string }>;

export type GeneratorResolutionKind = "unresolved" | "catalog" | "own_nomenclature" | "shared_nomenclature";

export type GeneratorRequirement = {
  id: string;
  sectionKey: EstimateSectionSystemKey;
  description: string;
  quantity: number;
  unit: EstimateUnit;
  resolution: GeneratorResolutionKind;
  resolvedId: string | null;
  resolvedLabel: string | null;
  profileKey?: string | null;
  assumption?: string | null;
  sellingUnitPrice?: number | null;
  sellingCurrencyCode?: string | null;
};

const SECTION_RULES: ReadonlyArray<{ key: EstimateSectionSystemKey; pattern: RegExp }> = [
  { key: "commissioning_works", pattern: /настрой|конфиг|пусконалад|программир|тестирован/i },
  { key: "installation_works", pattern: /монтаж|установ|проклад|демонтаж|подключен/i },
  { key: "installation_materials", pattern: /кабел|короб|креп|разъ[её]м|коннектор|гофр|труб|лоток|материал/i },
];

export function generateRequirements(requirement: string): GeneratorRequirement[] {
  const fragments = requirement.replace(/\r/g, "\n").split(/[\n,;:.]+/)
    .map((value) => value.trim()).filter((value) => value.length >= 2).slice(0, 30);

  return fragments.map((fragment, index) => {
    const quantityMatch = fragment.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:шт\.?|ед\.?|м\.?|компл\.?|час(?:а|ов)?\b)?/i);
    const quantity = quantityMatch ? Math.max(0.01, Math.min(999999, Number(quantityMatch[1].replace(",", ".")))) : 1;
    const description = fragment.replace(/^[-–—\s]+/, "").replace(/^\d+(?:[.,]\d+)?\s*(?:шт\.?|ед\.?|м\.?|компл\.?|час(?:а|ов)?\b)?\s*/i, "").trim() || fragment;
    const sectionKey = SECTION_RULES.find((rule) => rule.pattern.test(description))?.key ?? "equipment";
    const unit: EstimateUnit = /кабел|провод|гофр|труб|лоток/i.test(description) ? "meter" : /работ|монтаж|настрой|конфиг|установ|проклад/i.test(description) ? "service" : "pcs";
    return { id: `requirement-${index + 1}`, sectionKey, description: description.slice(0, 500), quantity, unit, resolution: "unresolved", resolvedId: null, resolvedLabel: null };
  });
}

export function countGeneratorResolutions(requirements: readonly GeneratorRequirement[]) {
  return requirements.reduce((counts, requirement) => {
    if (requirement.resolution === "catalog") counts.catalog += 1;
    else if (requirement.resolution === "own_nomenclature") counts.own += 1;
    else if (requirement.resolution === "shared_nomenclature") counts.shared += 1;
    else counts.unresolved += 1;
    return counts;
  }, { catalog: 0, own: 0, shared: 0, unresolved: 0 });
}
