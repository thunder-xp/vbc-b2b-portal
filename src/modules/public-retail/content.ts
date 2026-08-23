import type {
  PublicRetailCategoryDto,
  PublicRetailFacetDto,
  PublicRetailLocale,
  PublicRetailProductDetailDto,
} from "./types";

const MIN_USEFUL_DESCRIPTION_LENGTH = 40;
const MAX_CATEGORY_FACETS = 5;
const MAX_PRODUCT_FACTS = 3;

const genericDescription = /^(?:нет описания|описание отсутствует|no description|n\/a|[-–—])\.?$/iu;

const romanianFacetLabels: Record<string, string> = {
  "AI-Технологии": "Tehnologii AI",
  "MicroSD": "MicroSD",
  "PoE-Питание": "Alimentare PoE",
  "Аналитика": "Analitică",
  "Гибридные-каналы": "Canale hibride",
  "Дальность-ИК": "Distanță IR",
  "Защищенность": "Protecție",
  "Класс": "Clasă",
  "Материал": "Material",
  "Микрофон": "Microfon",
  "Оптические-порты": "Porturi optice",
  "Передача-данных": "Transmisie de date",
  "Передача-питания": "Transmitere alimentare",
  "Порты": "Porturi",
  "Пропускная-способность": "Lățime de bandă",
  "Разрешение-MPx": "Rezoluție MPx",
  "Светочувствительность": "Sensibilitate la lumină",
  "Скорость": "Viteză",
  "Технология": "Tehnologie",
  "Тип-объектива": "Tip obiectiv",
  "Тип-регистратора": "Tip recorder",
  "Управляемый": "Administrabil",
  "Фокусное-расстояние": "Distanță focală",
  "Форм-фактор": "Formă constructivă",
  "Цифровые-каналы": "Canale digitale",
};

export type PublicContentSource = "authored" | "governed" | "fallback";

export type PublicCategoryContent = {
  heading: string;
  intro: string;
  source: PublicContentSource;
  metaTitle: string;
  metaDescription: string;
  facets: string[];
  parent: PublicRetailCategoryDto | null;
  children: PublicRetailCategoryDto[];
  siblings: PublicRetailCategoryDto[];
  path: PublicRetailCategoryDto[];
};

export function buildPublicCategoryContent(input: {
  category: PublicRetailCategoryDto;
  categories: PublicRetailCategoryDto[];
  facets: PublicRetailFacetDto[];
  locale: PublicRetailLocale;
  authoredDescription?: string | null;
}): PublicCategoryContent {
  const { category, categories, locale } = input;
  const authored = usefulText(input.authoredDescription);
  const governed = usefulText(category.description);
  const facets = selectCategoryFacets(input.facets, locale);
  const parent = category.parentId
    ? categories.find((candidate) => candidate.id === category.parentId) ?? null
    : null;
  const children = categories
    .filter((candidate) => candidate.parentId === category.id)
    .sort(categoryOrder);
  const siblings = parent
    ? categories.filter((candidate) => candidate.parentId === parent.id && candidate.id !== category.id).sort(categoryOrder).slice(0, 6)
    : [];
  const fallback = categoryFallback(category.name, parent?.name, children.map((child) => child.name), facets, locale);
  const intro = authored ?? governed ?? fallback;
  const source: PublicContentSource = authored ? "authored" : governed ? "governed" : "fallback";

  return {
    heading: category.name,
    intro,
    source,
    metaTitle: categoryMetaTitle(category.name, locale),
    metaDescription: categoryMetaDescription(category.name, facets, locale, authored ?? governed),
    facets,
    parent,
    children,
    siblings,
    path: categoryPath(category, categories),
  };
}

export function resolvePublicProductDescription(
  product: Pick<PublicRetailProductDetailDto, "name" | "sku" | "shortDescription" | "description" | "categoryPath" | "specifications">,
  locale: PublicRetailLocale,
  authoredDescription?: string | null,
): { text: string; source: PublicContentSource } {
  const authored = usefulText(authoredDescription);
  if (authored) return { text: authored, source: "authored" };

  const governed = usefulText(product.description) ?? usefulText(product.shortDescription);
  if (governed) return { text: governed, source: "governed" };

  const categoryEntry = product.categoryPath.at(-1);
  const category = categoryEntry && !isInternalProjectCategory(categoryEntry.name, categoryEntry.slug)
    ? categoryEntry.name
    : undefined;
  const facts = product.specifications.slice(0, MAX_PRODUCT_FACTS).map((specification) => ({
    label: localizedFacetLabel(specification.label, locale),
    value: specification.value,
  }));
  return { text: productFallback(product.name, product.sku, category, facts, locale), source: "fallback" };
}

export function needsPublicProductFallback(
  product: Pick<PublicRetailProductDetailDto, "shortDescription" | "description">,
): boolean {
  return !usefulText(product.description) && !usefulText(product.shortDescription);
}

export function publicProductMetaDescription(
  product: Pick<PublicRetailProductDetailDto, "name" | "sku" | "shortDescription" | "description" | "categoryPath" | "specifications">,
  locale: PublicRetailLocale,
): string {
  return compactDescription(resolvePublicProductDescription(product, locale).text, 158);
}

export function localizedFacetLabel(label: string, locale: PublicRetailLocale): string {
  return locale === "ro" ? romanianFacetLabels[label] ?? label : label;
}

export function isUsefulPublicDescription(value: string | null | undefined): boolean {
  return usefulText(value) !== null;
}

export function sanitizePublicContentText(value: string): string {
  return value
    .replace(/\[cite:\s*\d+(?:\s*,\s*\d+)*\]/giu, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulText(value: string | null | undefined): string | null {
  const normalized = sanitizePublicContentText(value ?? "");
  if (normalized.length < MIN_USEFUL_DESCRIPTION_LENGTH || genericDescription.test(normalized)) return null;
  return normalized;
}

function selectCategoryFacets(facets: PublicRetailFacetDto[], locale: PublicRetailLocale): string[] {
  return facets
    .filter((facet) => facet.coverage > 0 && facet.label.trim())
    .sort((left, right) => right.coverage - left.coverage || left.label.localeCompare(right.label))
    .slice(0, MAX_CATEGORY_FACETS)
    .map((facet) => localizedFacetLabel(facet.label, locale));
}

function categoryFallback(
  name: string,
  parent: string | undefined,
  children: string[],
  facets: string[],
  locale: PublicRetailLocale,
): string {
  if (locale === "ro") {
    const context = parent ? ` din direcția „${parent}”` : "";
    const navigation = children.length
      ? ` Sunt disponibile subcategoriile ${formatList(children.slice(0, 4), locale)}.`
      : facets.length
        ? ` Pentru alegere, comparați ${formatList(facets, locale)}.`
        : "";
    return `Secțiunea „${name}” reunește produsele publicate de Novotech${context}.${navigation}`;
  }
  const context = parent ? ` в направлении «${parent}»` : "";
  const navigation = children.length
    ? ` Доступны подразделы: ${formatList(children.slice(0, 4), locale)}.`
    : facets.length
      ? ` При выборе сравните: ${formatList(facets, locale)}.`
      : "";
  return `В разделе «${name}» собраны опубликованные товары Novotech${context}.${navigation}`;
}

function categoryMetaTitle(name: string, locale: PublicRetailLocale): string {
  const title = locale === "ro"
    ? `${name} — echipamente în Moldova | Novotech`
    : `${name} — оборудование в Молдове | Novotech`;
  return title.length <= 72 ? title : `${name} | Novotech Moldova`;
}

function categoryMetaDescription(
  name: string,
  facets: string[],
  locale: PublicRetailLocale,
  governed: string | null,
): string {
  if (governed) return compactDescription(governed, 155);
  const dimensions = facets.slice(0, 4);
  const result = locale === "ro"
    ? `${name} în catalogul Novotech Moldova.${dimensions.length ? ` Comparați ${formatList(dimensions, locale)}.` : " Consultați modelele și prețurile cu amănuntul."}`
    : `${name} в каталоге Novotech Moldova.${dimensions.length ? ` Сравните ${formatList(dimensions, locale)}.` : " Смотрите модели и розничные цены."}`;
  return compactDescription(result, 155);
}

function productFallback(
  name: string,
  sku: string,
  category: string | undefined,
  facts: Array<{ label: string; value: string }>,
  locale: PublicRetailLocale,
): string {
  if (locale === "ro") {
    const identity = category
      ? `${name} este un produs din categoria „${category}”, cod ${sku}.`
      : `${name}, cod ${sku}, este disponibil în catalogul public Novotech.`;
    return facts.length ? `${identity} Caracteristici confirmate: ${formatFacts(facts)}.` : identity;
  }
  const identity = category
    ? `${name} — товар категории «${category}», артикул ${sku}.`
    : `${name} — товар из публичного каталога Novotech, артикул ${sku}.`;
  return facts.length ? `${identity} Подтверждённые характеристики: ${formatFacts(facts)}.` : identity;
}

function categoryPath(category: PublicRetailCategoryDto, categories: PublicRetailCategoryDto[]): PublicRetailCategoryDto[] {
  const byId = new Map(categories.map((candidate) => [candidate.id, candidate]));
  const path: PublicRetailCategoryDto[] = [];
  const seen = new Set<string>();
  let current: PublicRetailCategoryDto | undefined = category;
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

function formatFacts(facts: Array<{ label: string; value: string }>): string {
  return facts.map((fact) => `${fact.label}: ${fact.value}`).join("; ");
}

function formatList(values: string[], locale: PublicRetailLocale): string {
  if (values.length < 2) return values[0] ?? "";
  const separator = locale === "ro" ? " și " : " и ";
  return `${values.slice(0, -1).join(", ")}${separator}${values.at(-1)}`;
}

function compactDescription(value: string, maximum: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function categoryOrder(left: PublicRetailCategoryDto, right: PublicRetailCategoryDto): number {
  return left.name.localeCompare(right.name);
}

function isInternalProjectCategory(name: string, slug: string): boolean {
  const normalizedName = name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return normalizedName === "PROJECT EQUIPMENT" || slug.startsWith("project-equipment");
}
