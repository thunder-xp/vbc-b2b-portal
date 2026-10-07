"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

import { resolvePartnerBreadcrumbs, type PartnerLocale } from "../../partner-locale";
import { partnerNavigationIcons } from "./partner-navigation-icons";

const DashboardIcon = partnerNavigationIcons.dashboard;

export function PartnerPageBreadcrumbs({ locale }: { locale: PartnerLocale }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (!pathname) return null;
  const breadcrumbs = resolvePartnerBreadcrumbs(pathname, searchParams, locale);

  return (
    <nav aria-label={locale === "ro" ? "Navigare ierarhică" : "Хлебные крошки"} className="col-span-2 row-start-3 min-w-0 border-t border-zinc-100 pt-2 text-xs lg:row-start-2" data-partner-breadcrumb-header>
      <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {breadcrumbs.map((item, index) => {
          const current = index === breadcrumbs.length - 1;
          return (
            <li className={`flex items-center gap-1.5 ${index === 0 ? "shrink-0" : "min-w-0"} ${current ? "text-zinc-800" : "text-zinc-500"}`} key={`${item.href}:${index}`}>
              {index > 0 ? <span aria-hidden="true" className="shrink-0 text-zinc-300">/</span> : null}
              {item.iconKey === "dashboard" ? (
                <Link aria-current={current ? "page" : undefined} aria-label={item.label} className="inline-flex size-5 shrink-0 items-center justify-center rounded outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600" href={item.href} prefetch={false} title={item.label}>
                  <DashboardIcon aria-hidden="true" className="size-4" />
                </Link>
              ) : current ? (
                <h1 className="min-w-0 truncate text-xs font-medium">
                  <Link aria-current="page" className="inline-flex max-w-full items-center truncate rounded outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600" href={item.href} prefetch={false} title={item.label}>{item.label}</Link>
                </h1>
              ) : (
                <Link className="min-w-0 truncate rounded outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600" href={item.href} prefetch={false} title={item.label}>{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
