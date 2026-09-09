"use client";

import type { CatalogCategoryDto, CatalogSort } from "../services";
import { buildCatalogHref } from "../services/catalog-sort-state";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import type { CatalogCollection } from "../types";
import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { CatalogCategoryMenu, buildCategoryTree, type CatalogCategoryNode } from "./CatalogCategoryMenu";
import { getCatalogCopy, usePartnerLocale } from "../../partner-locale";
import type { NewRollingPeriod } from "../../commerce-period";

export { buildCategoryTree };
export type { CatalogCategoryNode };

export function CategoryMegaMenu({ categories, collection, merchandisingLabel, period, sort = "default" }: { categories: Array<Pick<CatalogCategoryDto, "id" | "name" | "parentId">>; collection?: CatalogCollection; merchandisingLabel?: MerchandisingLabelCode; period?: NewRollingPeriod; sort?: CatalogSort }) {
  const copy = getCatalogCopy(usePartnerLocale());
  return <CatalogCategoryMenu
    categories={categories}
    categoryHref={(category) => buildCatalogHref({ categoryId: category.id, collection, merchandisingLabel, period, sort })}
    labels={{
      back: copy.back,
      close: copy.closeCategories,
      dialog: copy.categoriesDialog,
      selectCategory: copy.chooseCategory,
      selectDirection: copy.chooseDirection,
      trigger: copy.categories,
    }}
    onOpen={() => recordBehaviorInteraction({
      eventName: "filters_applied",
      metadataSafe: { action: "category_launcher_opened" },
      route: "/cabinet/catalog",
      sourceSurface: "category_launcher",
    })}
  />;
}
