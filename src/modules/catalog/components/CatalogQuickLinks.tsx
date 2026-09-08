import type { CatalogRouteState } from "../services";
import { buildCatalogHref, resolveCatalogQuickLinks, type CatalogCategoryDto } from "../services";
import type { PartnerLocale } from "../../partner-locale";
import { getCatalogCopy } from "../../partner-locale";
import { PartnerTopCategoryFilterBar } from "./PartnerTopCategoryFilterBar";

export function CatalogQuickLinks({
  categories,
  locale,
  state,
}: {
  categories: CatalogCategoryDto[];
  locale: PartnerLocale;
  state: CatalogRouteState;
}) {
  const links = resolveCatalogQuickLinks(categories, locale);
  if (!links.length) return null;
  return <div data-testid="catalog-quick-links"><PartnerTopCategoryFilterBar
    allLabel={getCatalogCopy(locale).all}
    categories={links}
    currentHref={buildCatalogHref(state)}
    selectedCategoryIds={state.categoryIds}
  /></div>;
}
