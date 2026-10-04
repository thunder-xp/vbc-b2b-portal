export type CampaignPerformancePeriod = { from: string | null; to: string | null; version: number | null };
export type CampaignPerformanceQuery = { period?: string; from?: string; to?: string; version?: string };
export type CampaignPerformanceSummary = {
  campaignId: string; name: string; mechanicType: string; status: string;
  period: { from: string; to: string }; publicationVersion: number | null; versions: number[];
  audienceCompanies: number; viewsStartedAt: string | null; viewCoverageComplete: boolean;
  offerViews: number | null; viewingCompanies: number | null; interactingCompanies: number;
  viewedInteractingCompanies: number; qualifiedCompanies: number; viewedQualifiedCompanies: number;
  actionQualifiedCompanies: number; addActions: number; completeKitActions: number; rewardAddActions: number;
  benefitCompanies: number; attributedOrders: number; attributedLines: number; attributedUnits: number;
  participatingSkus: number; rewardPurchasedLines: number; rewardPurchasedUnits: number;
  qualifyingSpendUsd: { min: number; max: number } | null;
  attributedOrderValue: Array<{ currency: string; amount: number }>;
  campaignPricedLineValue: Array<{ currency: string; amount: number }>;
  observedPriceBenefit: null; grossProfit: null;
};

export function campaignPerformancePeriod(query: CampaignPerformanceQuery, now = new Date()): CampaignPerformancePeriod {
  const version = query.version ? Number(query.version) : null;
  if (version !== null && (!Number.isInteger(version) || version < 1 || version > 2_147_483_647)) throw new Error("Некорректная версия публикации.");
  if (query.period === "7" || query.period === "30") {
    return { from: new Date(now.getTime() - Number(query.period) * 86_400_000).toISOString(), to: now.toISOString(), version };
  }
  if (query.period !== "custom") return { from: null, to: null, version };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "")) throw new Error("Укажите обе даты периода.");
  const from = new Date(`${query.from}T00:00:00Z`);
  const to = new Date(new Date(`${query.to}T00:00:00Z`).getTime() + 86_400_000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())
    || from.toISOString().slice(0, 10) !== query.from
    || new Date(to.getTime() - 86_400_000).toISOString().slice(0, 10) !== query.to
    || to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) throw new Error("Период должен быть от 1 до 366 дней.");
  return { from: from.toISOString(), to: to.toISOString(), version };
}

export function observedRate(numerator: number, viewingCompanies: number | null): string {
  return viewingCompanies ? `${Math.round(numerator / viewingCompanies * 100)}%` : "Нет данных";
}

export const CAMPAIGN_MECHANIC_LABELS: Record<string, string> = {
  legacy_promo: "Товарное предложение", quantity_threshold_promo: "Количество → PROMO",
  fixed_bundle_promo: "Комплект → PROMO", conditional_attach_promo: "Условие → товар с PROMO", spend_threshold_promo: "Сумма закупки → PROMO",
};
