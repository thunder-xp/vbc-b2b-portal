import type { PartnerProductCompetitiveIntelligence } from "./types";

export function compareHistoricalPartnerPrices(input: {
  competitorPrice: number | null;
  competitorCurrency: string | null;
  novotechPrice: number | null;
  novotechCurrency: string | null;
}) {
  if (input.competitorPrice === null || input.novotechPrice === null || input.competitorPrice <= 0) {
    return { status: "price_unavailable" as const, deltaAmount: null, deltaPercent: null };
  }
  if (!input.competitorCurrency || !input.novotechCurrency || input.competitorCurrency !== input.novotechCurrency) {
    return { status: "currency_mismatch" as const, deltaAmount: null, deltaPercent: null };
  }
  const deltaAmount = round(input.competitorPrice - input.novotechPrice);
  return {
    status: "comparable" as const,
    deltaAmount,
    deltaPercent: round(deltaAmount / input.competitorPrice * 100),
  };
}

export function projectPartnerProductCompetitiveIntelligence(
  read: PartnerProductCompetitiveIntelligence,
): PartnerProductCompetitiveIntelligence {
  const observations = read.observations.map((observation) => {
    const comparison = compareHistoricalPartnerPrices({
      competitorPrice: observation.price,
      competitorCurrency: observation.currency,
      novotechPrice: observation.novotechPrice,
      novotechCurrency: observation.novotechCurrency,
    });
    return {
      ...observation,
      comparisonStatus: comparison.status,
      deltaAmount: comparison.deltaAmount,
      deltaPercent: comparison.deltaPercent,
    };
  });
  const latest = compareHistoricalPartnerPrices({
    competitorPrice: read.summary.latestCompetitorPrice,
    competitorCurrency: read.summary.latestCurrency,
    novotechPrice: read.summary.latestNovotechPrice,
    novotechCurrency: read.summary.latestNovotechCurrency,
  });
  return {
    ...read,
    observations,
    summary: {
      ...read.summary,
      latestDeltaAmount: latest.deltaAmount,
      latestDeltaPercent: latest.deltaPercent,
    },
  };
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
