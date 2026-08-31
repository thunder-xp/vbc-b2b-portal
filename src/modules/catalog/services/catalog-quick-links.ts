import type { PartnerLocale } from "../../partner-locale";

import type { CatalogCategoryDto } from "./catalog.service";

export const CATALOG_QUICK_LINK_CODES = [
  "video",
  "access",
  "security",
  "audio",
  "network",
  "intercom",
  "it",
  "materials",
  "power",
] as const;

export type CatalogQuickLinkCode = (typeof CATALOG_QUICK_LINK_CODES)[number];

type CatalogQuickLinkDefinition = {
  code: CatalogQuickLinkCode;
  labels: Record<PartnerLocale, string>;
  categoryExternal1cIds: readonly string[];
};

export type CatalogQuickLink = {
  code: CatalogQuickLinkCode;
  label: string;
  categoryIds: string[];
};

const DEFINITIONS: readonly CatalogQuickLinkDefinition[] = [
  { code: "video", labels: { ru: "ВИДЕО", ro: "VIDEO" }, categoryExternal1cIds: ["772c9d50-3298-11e9-a216-000c29411cbe"] },
  { code: "access", labels: { ru: "СКУД", ro: "CONTROL ACCES" }, categoryExternal1cIds: ["fe802fd7-c941-11e8-80eb-000c29a58b59"] },
  { code: "security", labels: { ru: "ОПС", ro: "SECURITATE" }, categoryExternal1cIds: ["f5379005-2857-11e9-80ed-000c29a58b59", "b6b833a8-c5fb-11ec-049f-7239d3b7bd5c"] },
  { code: "audio", labels: { ru: "ЗВУК", ro: "SUNET" }, categoryExternal1cIds: ["772c9d4d-3298-11e9-a216-000c29411cbe"] },
  { code: "network", labels: { ru: "СЕТЬ", ro: "REȚEA" }, categoryExternal1cIds: ["eedee611-3218-11e9-a216-000c29411cbe", "9ad481a2-99c1-11e9-804d-000c2988d323"] },
  { code: "intercom", labels: { ru: "ДОМОФОН", ro: "INTERFON" }, categoryExternal1cIds: ["772c9d4b-3298-11e9-a216-000c29411cbe"] },
  { code: "it", labels: { ru: "IT", ro: "IT" }, categoryExternal1cIds: ["3b8d3fa9-6457-11e8-80d2-000c29a58b59", "72474ac1-e0fc-11e9-920e-000c29cf9dd4", "0779591b-9b16-11e8-80e6-000c29a58b59"] },
  { code: "materials", labels: { ru: "МАТЕРИАЛЫ", ro: "MATERIALE" }, categoryExternal1cIds: ["f5379003-2857-11e9-80ed-000c29a58b59", "f5379001-2857-11e9-80ed-000c29a58b59"] },
  { code: "power", labels: { ru: "ПИТАНИЕ", ro: "ALIMENTARE" }, categoryExternal1cIds: ["eedee60b-3218-11e9-a216-000c29411cbe"] },
];

export function parseCatalogQuickLinkCode(value: string | undefined): CatalogQuickLinkCode | undefined {
  return CATALOG_QUICK_LINK_CODES.find((code) => code === value);
}
export function resolveCatalogQuickLinks(
  categories: CatalogCategoryDto[],
  locale: PartnerLocale,
): CatalogQuickLink[] {
  const byExternal1cId = new Map(
    categories
      .filter((category) => category.external1cId)
      .map((category) => [category.external1cId!, category]),
  );

  return DEFINITIONS.flatMap((definition) => {
    const resolved = definition.categoryExternal1cIds.map((id) => byExternal1cId.get(id));
    if (resolved.some((category) => !category)) return [];
    return [{
      code: definition.code,
      label: definition.labels[locale],
      categoryIds: resolved.map((category) => category!.id),
    }];
  });
}
