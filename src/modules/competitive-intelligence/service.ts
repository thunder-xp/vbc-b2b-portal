import type {
  CompetitiveSourceType,
  CompetitiveVatMode,
  ProductCompetitorPricingItem,
} from "./types";
import type { ProductCommercialViewDto } from "../pricing-inventory";

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
  }>;
  rates: { partnerUsdMdl: number | null; retailUsdMdl: number | null; effectiveDate: string | null };
};

export function buildProductCompetitorPricing(
  read: ProductPricingRead,
  commercialView?: ProductCommercialViewDto,
): ProductCompetitorPricingItem[] {
  const novotech = commercialView?.partnerPriceMdl ?? commercialView?.partnerPrice;
  return read.items.map((item) => {
    const retailToOwn = item.ownPrice === null || !item.ownCurrency
      ? null
      : comparableAmount(item.retailPrice, item.retailCurrency, item.ownCurrency, read.rates.retailUsdMdl);
    const retailDiscountAmount = retailToOwn === null || item.ownPrice === null ? null : round(retailToOwn - item.ownPrice);
    const retailDiscountPercent = retailDiscountAmount === null || retailToOwn === null || retailToOwn <= 0
      ? null
      : round(retailDiscountAmount / retailToOwn * 100);
    const ownToNovotech = item.ownPrice === null || !item.ownCurrency || !novotech?.currencyCode
      ? null
      : comparableAmount(item.ownPrice, item.ownCurrency, novotech.currencyCode, read.rates.partnerUsdMdl);
    const novotechDifferenceAmount = ownToNovotech === null || !novotech
      ? null
      : round(ownToNovotech - novotech.amount);
    const novotechDifferencePercent = novotechDifferenceAmount === null || ownToNovotech === null || ownToNovotech <= 0
      ? null
      : round(novotechDifferenceAmount / ownToNovotech * 100);
    return {
      ...item,
      retailDiscountAmount,
      retailDiscountPercent,
      novotechPrice: novotech?.amount ?? null,
      novotechCurrency: novotech?.currencyCode ?? null,
      novotechDifferenceAmount,
      novotechDifferencePercent,
      comparisonStatus: item.ownPrice === null || !novotech
        ? "price_unavailable"
        : ownToNovotech === null
          ? "currency_mismatch"
          : "comparable",
    };
  });
}

function comparableAmount(amount: number, source: string, target: string, mdlPerUsd: number | null) {
  if (source === target) return amount;
  if (!mdlPerUsd || !Number.isFinite(mdlPerUsd) || mdlPerUsd <= 0) return null;
  if (source === "USD" && target === "MDL") return round(amount * mdlPerUsd);
  if (source === "MDL" && target === "USD") return round(amount / mdlPerUsd);
  return null;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
