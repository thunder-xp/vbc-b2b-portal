import type { EffectiveRollingPeriod } from "../../commerce-period";

export function repeatPurchaseHref({ categoryIds = [], page = 1, period = 365, search = "" }: { categoryIds?: string[]; page?: number; period?: EffectiveRollingPeriod; search?: string }) {
  const params = new URLSearchParams();
  if (period !== 365) params.set("period", String(period));
  if (categoryIds.length) params.set("categories", [...new Set(categoryIds)].sort().join(","));
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/cabinet/repeat-purchase${query ? `?${query}` : ""}`;
}
