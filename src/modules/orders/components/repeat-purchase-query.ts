export function repeatPurchaseHref({ categoryIds = [], page = 1, search = "" }: { categoryIds?: string[]; page?: number; search?: string }) {
  const params = new URLSearchParams();
  for (const categoryId of categoryIds) params.append("category", categoryId);
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/cabinet/repeat-purchase${query ? `?${query}` : ""}`;
}
