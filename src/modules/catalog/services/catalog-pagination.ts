export type CatalogPaginationItem = number | "ellipsis";

export function getCatalogTotalPages(totalCount: number, pageSize: number): number {
  if (!Number.isFinite(totalCount) || !Number.isFinite(pageSize) || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, totalCount) / Math.floor(pageSize)));
}

export function buildCatalogPaginationItems(currentPage: number, totalPages: number): CatalogPaginationItem[] {
  const lastPage = Math.max(1, Math.floor(totalPages));
  const activePage = Math.min(Math.max(1, Math.floor(currentPage)), lastPage);
  const visiblePages = new Set([1, lastPage]);

  for (let page = Math.max(1, activePage - 2); page <= Math.min(lastPage, activePage + 2); page += 1) {
    visiblePages.add(page);
  }

  const pages = [...visiblePages].sort((left, right) => left - right);
  return pages.flatMap<CatalogPaginationItem>((page, index) => {
    const previous = pages[index - 1];
    if (previous === undefined || page - previous === 1) return [page];
    if (page - previous === 2) return [previous + 1, page];
    return ["ellipsis", page];
  });
}
