import Link from "next/link";

import type { CatalogRouteState } from "../services";
import { buildCatalogHref, resolveCatalogQuickLinks, type CatalogCategoryDto } from "../services";
import type { PartnerLocale } from "../../partner-locale";

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

  return (
    <nav aria-label={locale === "ro" ? "Acces rapid la categorii" : "Быстрый выбор категории"} className="min-w-0 overflow-x-auto py-0.5" data-testid="catalog-quick-links">
      <div className="flex min-w-max gap-1.5">
        {links.map((link) => {
          const active = state.categorySet === link.code;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-9 items-center justify-center rounded border px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${active ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-300 bg-white text-zinc-800 hover:border-emerald-600 hover:text-emerald-800"}`}
              href={buildCatalogHref({
                availability: state.availability,
                brandId: state.brandId,
                categorySet: link.code,
                collection: state.collection,
                merchandisingLabel: state.merchandisingLabel,
                search: state.search,
                sort: state.sort,
              })}
              key={link.code}
              prefetch={false}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
