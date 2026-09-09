import type { RollingPeriod } from "../../commerce-period";

export function repeatPurchaseHref({ categoryIds = [], page = 1, period = 30, search = "" }: { categoryIds?: string[]; page?: number; period?: RollingPeriod; search?: string }) {
  const params = new URLSearchParams();
  params.set("period", String(period));
  if (categoryIds.length) params.set("categories", [...new Set(categoryIds)].sort().join(","));
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/cabinet/repeat-purchase${query ? `?${query}` : ""}`;
}
