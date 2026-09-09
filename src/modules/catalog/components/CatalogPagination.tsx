import type { MerchandisingLabelCode } from "../../merchandising/types";
import { NumberedPagination } from "../../platform-ui";
import {
  buildCatalogHref,
  getCatalogTotalPages,
  type CatalogSort,
  type CatalogQuickLinkCode,
} from "../services";
import type { CatalogAvailability } from "./CatalogFilters";
import type { CatalogCollection } from "../types";
import type { PartnerLocale } from "../../partner-locale";
import type { NewRollingPeriod } from "../../commerce-period";

type CatalogPaginationProps = {
  availability: CatalogAvailability;
  attributeFilters: Record<string, string[]>;
  brandId?: string;
  categoryId?: string;
  categoryIds?: string[];
  categorySet?: CatalogQuickLinkCode;
  collection?: CatalogCollection;
  explicitAll: boolean;
  merchandisingLabel?: MerchandisingLabelCode;
  locale?: PartnerLocale;
  page: number;
  period?: NewRollingPeriod;
  pageSize: number;
  search?: string;
  sort: CatalogSort;
  totalCount: number;
};

export function CatalogPagination({ availability, attributeFilters, brandId, categoryId, categoryIds, categorySet, collection, explicitAll, merchandisingLabel, locale = "ru", page, pageSize, period, search, sort, totalCount }: CatalogPaginationProps) {
  const totalPages = getCatalogTotalPages(totalCount, pageSize);
  if (totalPages <= 1) return null;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const hrefForPage = (targetPage: number) => buildCatalogHref({ availability, attributeFilters, brandId, categoryId, categoryIds, categorySet, collection, explicitAll, merchandisingLabel, page: targetPage, period, search, sort });

  return <NumberedPagination ariaLabel={locale === "ro" ? "Paginarea catalogului" : "Пагинация каталога"} currentPage={currentPage} hrefForPage={hrefForPage} locale={locale} totalPages={totalPages} />;
}
