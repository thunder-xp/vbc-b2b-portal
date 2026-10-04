"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { resolvePartnerBreadcrumbs, type PartnerLocale } from "../../partner-locale";

export function PartnerPageBreadcrumbs({ locale }: { locale: PartnerLocale }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!pathname) return null;
  const breadcrumbs = resolvePartnerBreadcrumbs(pathname, searchParams, locale);

  return (
    <nav aria-label={locale === "ro" ? "Navigare ierarhică" : "Хлебные крошки"} className="col-span-2 row-start-3 min-w-0 border-t border-zinc-100 pt-2 text-xs lg:col-span-3 lg:row-start-2" data-partner-breadcrumb-header>
      <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {breadcrumbs.map((item, index) => {
          const current = index === breadcrumbs.length - 1;
          return (
            <li className={current ? "min-w-0 truncate" : "shrink-0 truncate text-zinc-500"} key={`${item.label}:${index}`}>
              {current
                ? <h1 aria-current="page" className="truncate text-xs font-medium text-zinc-800">{item.label}</h1>
                : <>{item.label}<span aria-hidden="true" className="ml-1.5 text-zinc-300">/</span></>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
