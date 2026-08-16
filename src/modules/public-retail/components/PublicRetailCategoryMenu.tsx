"use client";

import { CatalogCategoryMenu } from "../../catalog/components/CatalogCategoryMenu";
import type { PublicRetailCategoryDto, PublicRetailLocale } from "../types";

export function PublicRetailCategoryMenu({ categories, locale }: { categories: PublicRetailCategoryDto[]; locale: PublicRetailLocale }) {
  const ro = locale === "ro";
  return <CatalogCategoryMenu
    categories={categories}
    categoryHref={(category) => `/catalog?lang=${locale}&category=${encodeURIComponent(category.slug)}`}
    labels={{
      back: ro ? "Înapoi" : "Назад",
      close: ro ? "Închide categoriile" : "Закрыть категории",
      dialog: ro ? "Categorii catalog" : "Категории каталога",
      selectCategory: ro ? "Selectați categoria" : "Выберите категорию",
      selectDirection: ro ? "Selectați direcția" : "Выберите направление",
      trigger: ro ? "Categorii" : "Категории",
    }}
    square
    tone="retail"
  />;
}
