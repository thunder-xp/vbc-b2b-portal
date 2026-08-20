import type { MerchandisingLabelCode } from "../../merchandising/types";
import { NumberedPagination } from "../../platform-ui";
import {
  buildCatalogHref,
  getCatalogTotalPages,
  type CatalogSort,
} from "../services";
import type { CatalogAvailability } from "./CatalogFilters";
import type { CatalogCollection } from "../types";

type CatalogPaginationProps = {
  availability: CatalogAvailability;
  attributeFilters: Record<string, string[]>;
  brandId?: string;
  categoryId?: string;
  collection?: CatalogCollection;
  explicitAll: boolean;
  merchandisingLabel?: MerchandisingLabelCode;
  page: number;
  pageSize: number;
  search?: string;
  sort: CatalogSort;
  totalCount: number;
};

export function CatalogPagination({ availability, attributeFilters, brandId, categoryId, collection, explicitAll, merchandisingLabel, page, pageSize, search, sort, totalCount }: CatalogPaginationProps) {
  const totalPages = getCatalogTotalPages(totalCount, pageSize);
  if (totalPages <= 1) return null;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const hrefForPage = (targetPage: number) => buildCatalogHref({ availability, attributeFilters, brandId, categoryId, collection, explicitAll, merchandisingLabel, page: targetPage, search, sort });

  return <NumberedPagination ariaLabel="Пагинация каталога" currentPage={currentPage} hrefForPage={hrefForPage} totalPages={totalPages} />;
}
