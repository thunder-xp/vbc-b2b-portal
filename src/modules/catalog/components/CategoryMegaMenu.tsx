"use client";

import type { CatalogCategoryDto, CatalogSort } from "../services";
import { buildCatalogHref } from "../services/catalog-sort-state";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import type { CatalogCollection } from "../types";
import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { CatalogCategoryMenu, buildCategoryTree, type CatalogCategoryNode } from "./CatalogCategoryMenu";

export { buildCategoryTree };
export type { CatalogCategoryNode };

export function CategoryMegaMenu({ categories, collection, merchandisingLabel, sort = "default" }: { categories: CatalogCategoryDto[]; collection?: CatalogCollection; merchandisingLabel?: MerchandisingLabelCode; sort?: CatalogSort }) {
  return <CatalogCategoryMenu
    categories={categories}
    categoryHref={(category) => buildCatalogHref({ categoryId: category.id, collection, merchandisingLabel, sort })}
    labels={{
      back: "Назад",
      close: "Закрыть категории",
      dialog: "Категории каталога",
      selectCategory: "Выберите категорию",
      selectDirection: "Выберите направление",
      trigger: "Категории",
    }}
    onOpen={() => recordBehaviorInteraction({
      eventName: "filters_applied",
      metadataSafe: { action: "category_launcher_opened" },
      route: "/cabinet/catalog",
      sourceSurface: "category_launcher",
    })}
  />;
}
