import { createHash } from "node:crypto";

import { PUBLIC_RETAIL_AVAILABILITY, PUBLIC_RETAIL_LOCALES } from "./types";

export type PublicCatalogSearchParams = Record<string, string | string[] | undefined>;

const ATTRIBUTE_KEY = /^attr\.property_[0-9a-f-]{36}$/;
const SOURCE_IDENTIFIER = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VIEWS = new Set(["all", "popular", "new", "hot", "special", "replenishment"]);
const SORTS = new Set(["price_asc", "price_desc"]);
const PERIODS = new Set(["30", "60", "90", "365"]);
const SINGLE_VALUE_PARAMS = ["lang", "q", "category", "availability", "view", "sort", "page", "return", "period", "newPeriod", "hotPeriod"] as const;

export function isValidPublicCatalogRequest(params: PublicCatalogSearchParams): boolean {
  if (SINGLE_VALUE_PARAMS.some((name) => Array.isArray(params[name]) && params[name]!.length !== 1)) return false;
  const attributeEntries = Object.entries(params).filter(([key]) => key.startsWith("attr."));
  if (attributeEntries.length > 8 || attributeEntries.some(([key]) => !ATTRIBUTE_KEY.test(key))) return false;

  for (const [, input] of attributeEntries) {
    if (Array.isArray(input) && input.length !== 1) return false;
    const raw = first(input) ?? "";
    if (raw.length > 1_600) return false;
    const values = [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
    if (values.length < 1 || values.length > 10) return false;
    if (values.some((value) => value.length > 160 || SOURCE_IDENTIFIER.test(value))) return false;
  }

  const lang = singleParam(params.lang);
  const search = singleParam(params.q)?.trim();
  const category = singleParam(params.category)?.trim();
  const availability = singleParam(params.availability)?.trim();
  const view = singleParam(params.view)?.trim();
  const sort = singleParam(params.sort)?.trim();
  const page = singleParam(params.page)?.trim();
  const returnHref = singleParam(params.return);

  if (lang && !PUBLIC_RETAIL_LOCALES.includes(lang as (typeof PUBLIC_RETAIL_LOCALES)[number])) return false;
  if (search && search.replace(/\s+/g, " ").length > 100) return false;
  if (category && (category.length > 160 || !SLUG.test(category))) return false;
  if (availability && !PUBLIC_RETAIL_AVAILABILITY.includes(availability as (typeof PUBLIC_RETAIL_AVAILABILITY)[number])) return false;
  if (view && !VIEWS.has(view)) return false;
  if (sort && !SORTS.has(sort)) return false;
  if (page && (!/^\d{1,3}$/.test(page) || Number(page) < 1 || Number(page) > 209)) return false;
  if (returnHref && returnHref.length > 2_000) return false;

  for (const name of ["period", "newPeriod", "hotPeriod"] as const) {
    const value = singleParam(params[name]);
    if (value && !PERIODS.has(value)) return false;
  }

  return true;
}

export function publicCatalogDailyRotationSeed(now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const digest = createHash("sha256").update(`novotech-public-catalog:${day}`, "utf8").digest("hex").slice(0, 32).split("");
  digest[12] = "4";
  digest[16] = "8";
  const value = digest.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function singleParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : "\0";
  return value;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
