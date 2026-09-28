"use client";

import { usePathname, useSearchParams } from "next/navigation";

import type { PartnerLocale } from "../../partner-locale";

type PageContext = Readonly<{ section: string; title: string }>;

const PAGE_CONTEXT: Record<string, Record<PartnerLocale, PageContext>> = {
  "/cabinet/cart": {
    ru: { section: "Оформление заказа", title: "Корзина" },
    ro: { section: "Finalizarea comenzii", title: "Coș" },
  },
  "/cabinet/finance": {
    ru: { section: "Кабинет", title: "Финансы" },
    ro: { section: "Cabinet", title: "Finanțe" },
  },
  "/cabinet/offers": {
    ru: { section: "Продажи", title: "Предложения" },
    ro: { section: "Vânzări", title: "Oferte" },
  },
  "/cabinet/opportunities": {
    ru: { section: "Покупки", title: "Возможности" },
    ro: { section: "Achiziții", title: "Oportunități" },
  },
  "/cabinet/purchasing-lists": {
    ru: { section: "Подборки", title: "Мои подборки" },
    ro: { section: "Selecții", title: "Selecțiile mele" },
  },
  "/cabinet/specifications": {
    ru: { section: "Продажи", title: "Спецификации" },
    ro: { section: "Vânzări", title: "Specificații" },
  },
};

export function PartnerPageBreadcrumbs({ locale }: { locale: PartnerLocale }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageContext = pathname ? PAGE_CONTEXT[pathname] : undefined;
  if (!pageContext) return null;

  const isFavorites = pathname === "/cabinet/purchasing-lists" && searchParams.get("filter") === "favorites";
  const context = pageContext[locale];
  const title = isFavorites ? (locale === "ro" ? "Favorite" : "Избранное") : context.title;
  const section = isFavorites ? (locale === "ro" ? "Achiziții" : "Покупки") : context.section;

  return (
    <nav aria-label={locale === "ro" ? "Navigare ierarhică" : "Хлебные крошки"} className="col-span-2 row-start-3 min-w-0 border-t border-zinc-100 pt-2 text-xs sm:text-sm lg:col-span-3 lg:row-start-2">
      <ol className="flex min-w-0 items-center gap-2 overflow-hidden">
        <li className="shrink-0 truncate text-zinc-500">{section}</li>
        <li aria-hidden="true" className="shrink-0 text-zinc-300">/</li>
        <li className="min-w-0 truncate"><h1 aria-current="page" className="truncate font-medium text-zinc-800">{title}</h1></li>
      </ol>
    </nav>
  );
}
