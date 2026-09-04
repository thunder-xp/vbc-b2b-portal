import type {
  CompetitiveSourceType,
  CompetitiveVatMode,
  ProductCompetitorPricingItem,
} from "./types";

export const COMPETITIVE_INTELLIGENCE_MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const COMPETITIVE_INTELLIGENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export const COMPETITIVE_INTELLIGENCE_CURRENCIES = ["MDL", "USD", "EUR"] as const;
export const COMPETITIVE_INTELLIGENCE_VAT_MODES: readonly CompetitiveVatMode[] = [
  "included",
  "excluded",
  "not_applicable",
  "not_specified",
];
export const COMPETITIVE_INTELLIGENCE_SOURCE_TYPES: readonly CompetitiveSourceType[] = [
  "verbal",
  "message",
  "quotation",
  "order",
  "invoice",
  "other",
];
export const STRONG_RECOMMENDATION_MIN_COMPANIES = 3;
export const STRONG_RECOMMENDATION_MIN_OBSERVATIONS = 5;

export function resolveCompetitiveConfidence(
  sourceType: CompetitiveSourceType,
  hasEvidence: boolean,
) {
  if (hasEvidence && ["quotation", "order", "invoice"].includes(sourceType)) return "high" as const;
  if (["message", "quotation", "order", "invoice"].includes(sourceType)) return "medium" as const;
  return "low" as const;
}

export function normalizeCompetitorName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ru").replace(/[\s\p{P}]+/gu, "");
}

export function isPossibleOrderOfMagnitudeOutlier(value: number, reference: number | null) {
  return reference !== null && reference > 0 && (value > reference * 10 || value < reference / 10);
}

export function formatCompetitiveMoney(value: number | null, currency: string | null, locale: "ru" | "ro") {
  if (value === null) return "—";
  return `${new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { maximumFractionDigits: 2 }).format(value)} ${currency ?? ""}`.trim();
}

export function formatCompetitivePercent(value: number | null, locale: "ru" | "ro") {
  if (value === null) return "—";
  return `${new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { maximumFractionDigits: 2 }).format(value)}%`;
}

export function formatCompetitiveDifferenceMoney(value: number | null, currency: string | null, locale: "ru" | "ro") {
  const formatted = formatCompetitiveMoney(value, currency, locale);
  return value !== null && value > 0 ? `+${formatted}` : formatted;
}

export function formatCompetitiveDifferencePercent(value: number | null, locale: "ru" | "ro") {
  const formatted = formatCompetitivePercent(value, locale);
  return value !== null && value > 0 ? `+${formatted}` : formatted;
}

type ProductPricingRead = {
  items: Array<{
    competitorId: string;
    competitorName: string;
    retailPrice: number;
    retailCurrency: string;
    retailEffectiveDate: string;
    ownPrice: number | null;
    ownCurrency: string | null;
    ownObservationDate: string | null;
    ownQuantity: number | null;
    retailDiscountAmount: number | null;
    retailDiscountPercent: number | null;
    retailComparisonStatus: ProductCompetitorPricingItem["retailComparisonStatus"];
    novotechPrice: number | null;
    novotechCurrency: string | null;
    novotechDifferenceAmount: number | null;
    novotechDifferencePercent: number | null;
    comparisonStatus: ProductCompetitorPricingItem["comparisonStatus"];
  }>;
};

export function buildProductCompetitorPricing(
  read: ProductPricingRead,
): ProductCompetitorPricingItem[] {
  return read.items;
}
