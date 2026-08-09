import type { EstimateLineType, EstimateSectionSystemKey } from "../types";

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
  { key: "installation_works", name: "Монтажные работы", addLabel: "Добавить вид работ", subtotalLabel: "Итого за монтажные работы", defaultMode: "service", allowedModes: ["service", "external"] },
  { key: "commissioning_works", name: "Пусконаладочные работы", addLabel: "Добавить вид работ", subtotalLabel: "Итого за пусконаладочные работы", defaultMode: "service", allowedModes: ["service", "external"] },
] as const;

export const CANONICAL_ESTIMATE_SECTION_BY_KEY = new Map(CANONICAL_ESTIMATE_SECTIONS.map((section) => [section.key, section]));

export function canonicalSectionOrder(key: EstimateSectionSystemKey | null): number {
  if (!key) return CANONICAL_ESTIMATE_SECTIONS.length;
  return CANONICAL_ESTIMATE_SECTIONS.findIndex((section) => section.key === key);
}

export function resolveCanonicalSectionKey(section: {
  name: string;
  systemKey?: EstimateSectionSystemKey | null;
}): EstimateSectionSystemKey | null {
  if (section.systemKey) return section.systemKey;
  return CANONICAL_ESTIMATE_SECTIONS.find((candidate) => candidate.name === section.name)?.key ?? null;
}

export function resolveCanonicalLineSectionKey(
  lineType: EstimateLineType,
  section: { name: string; systemKey?: EstimateSectionSystemKey | null } | null,
): EstimateSectionSystemKey {
  const explicitKey = section ? resolveCanonicalSectionKey(section) : null;
  if (explicitKey) return explicitKey;
  return lineType === "service" ? "installation_works" : "equipment";
}

export type EstimateSectionPresentation<TLine> = {
  config: (typeof CANONICAL_ESTIMATE_SECTIONS)[number];
  targetSectionId: string | null;
  lines: TLine[];
  total: number;
};

export function buildCanonicalEstimateSectionPresentation<TLine extends {
  id: string;
  sectionId: string;
  lineType: EstimateLineType;
}>(input: {
  sections: Array<{ id: string; name: string; systemKey?: EstimateSectionSystemKey | null }>;
  lines: TLine[];
  calculatedLines: Array<{ id: string; lineTotal: number | null }>;
  sectionTotals: Array<{ id: string; total: number }>;
}): Array<EstimateSectionPresentation<TLine>> {
  const sectionById = new Map(input.sections.map((section) => [section.id, section]));
  const linesByKey = new Map<EstimateSectionSystemKey, TLine[]>(CANONICAL_ESTIMATE_SECTIONS.map((section) => [section.key, []]));
  const linesByPersistedSectionId = new Map<string, TLine[]>();
  for (const line of input.lines) {
    const key = resolveCanonicalLineSectionKey(line.lineType, sectionById.get(line.sectionId) ?? null);
    linesByKey.get(key)?.push(line);
    const persistedLines = linesByPersistedSectionId.get(line.sectionId) ?? [];
    persistedLines.push(line);
    linesByPersistedSectionId.set(line.sectionId, persistedLines);
  }

  const calculatedLineById = new Map(input.calculatedLines.map((line) => [line.id, line]));
  const sectionTotalById = new Map(input.sectionTotals.map((section) => [section.id, section.total]));
  const totalsByKey = new Map<EstimateSectionSystemKey, number>(CANONICAL_ESTIMATE_SECTIONS.map((section) => [section.key, 0]));
  for (const section of input.sections) {
    const grouped = new Map<EstimateSectionSystemKey, number>();
    for (const line of linesByPersistedSectionId.get(section.id) ?? []) {
      const key = resolveCanonicalLineSectionKey(line.lineType, section);
      const lineTotal = calculatedLineById.get(line.id)?.lineTotal ?? 0;
      grouped.set(key, (grouped.get(key) ?? 0) + lineTotal);
    }
    const rawTotal = [...grouped.values()].reduce((sum, value) => sum + value, 0);
    for (const [key, value] of grouped) {
      const allocated = rawTotal > 0 ? (sectionTotalById.get(section.id) ?? 0) * value / rawTotal : 0;
      totalsByKey.set(key, (totalsByKey.get(key) ?? 0) + allocated);
    }
  }

  return CANONICAL_ESTIMATE_SECTIONS.map((config) => ({
    config,
    targetSectionId: input.sections.find((section) => resolveCanonicalSectionKey(section) === config.key)?.id ?? null,
    lines: linesByKey.get(config.key) ?? [],
    total: Math.round((totalsByKey.get(config.key) ?? 0) * 100) / 100,
  }));
}
