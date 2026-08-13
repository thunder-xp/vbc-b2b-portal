import { Menu, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { retailCopy } from "../presentation";
import type { PublicRetailLocale } from "../types";
import { PublicRetailCartBadge } from "./PublicRetailCartBadge";

type Props = { children: ReactNode; locale: PublicRetailLocale; languagePath: string; cartQuantity?: number };

export function PublicRetailShell({ children, locale, languagePath, cartQuantity }: Props) {
  const copy = retailCopy[locale];
  const languageHref = (next: PublicRetailLocale) => `${languagePath}${languagePath.includes("?") ? "&" : "?"}lang=${next}`;
  const links = [
    [copy.catalog, `/catalog?lang=${locale}`],
    [copy.chooseSystem, `/calculator/cctv?lang=${locale}`],
    [copy.services, `/?lang=${locale}#installation`],
    [copy.delivery, `/?lang=${locale}#delivery`],
    [copy.support, `/?lang=${locale}#support`],
  ] as const;

  return <div className="min-h-screen bg-white text-zinc-950">
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-17 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link aria-label="Novotech Systems" className="flex shrink-0 items-center gap-2.5" href={`/?lang=${locale}`}>
          <span className="grid size-9 place-items-center rounded-sm bg-emerald-700 text-white"><ShieldCheck aria-hidden="true" className="size-5" /></span>
          <span className="text-sm font-bold sm:text-base">NOVOTECH <span className="hidden font-medium text-zinc-500 sm:inline">SYSTEMS</span></span>
        </Link>
        <nav aria-label="Основная навигация" className="ml-auto hidden items-center gap-5 xl:flex">
          {links.map(([label, href]) => <Link className="text-sm font-medium text-zinc-700 hover:text-emerald-700" href={href} key={href}>{label}</Link>)}
        </nav>
        <form action="/catalog" className="ml-auto hidden min-w-52 items-center border-b border-zinc-300 lg:flex xl:ml-2" role="search">
          <input name="lang" type="hidden" value={locale} />
          <Search aria-hidden="true" className="size-4 shrink-0 text-zinc-500" />
          <label className="sr-only" htmlFor="retail-header-search">{copy.search}</label>
          <input className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-zinc-400" id="retail-header-search" name="q" placeholder={copy.search} />
        </form>
        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <PublicRetailCartBadge locale={locale} totalQuantity={cartQuantity} />
          <Link aria-current={locale === "ru" ? "page" : undefined} className={`min-h-11 px-2 py-3 text-xs font-semibold ${locale === "ru" ? "text-emerald-700" : "text-zinc-500"}`} href={languageHref("ru")}>RU</Link>
          <span aria-hidden="true" className="text-zinc-300">/</span>
          <Link aria-current={locale === "ro" ? "page" : undefined} className={`min-h-11 px-2 py-3 text-xs font-semibold ${locale === "ro" ? "text-emerald-700" : "text-zinc-500"}`} href={languageHref("ro")}>RO</Link>
          <Link className="hidden min-h-11 items-center border-l border-zinc-200 pl-4 text-sm font-semibold text-zinc-700 hover:text-emerald-700 sm:flex" href="/cabinet">{copy.partners}</Link>
          <details className="relative xl:hidden">
            <summary aria-label={copy.menu} className="grid size-11 cursor-pointer list-none place-items-center rounded-sm hover:bg-zinc-100"><Menu aria-hidden="true" className="size-5" /></summary>
            <nav aria-label="Мобильная навигация" className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] border border-zinc-200 bg-white p-2 shadow-xl">
              {links.map(([label, href]) => <Link className="flex min-h-11 items-center px-3 text-sm font-medium hover:bg-zinc-50" href={href} key={href}>{label}</Link>)}
              <Link className="flex min-h-11 items-center border-t border-zinc-100 px-3 text-sm font-semibold text-emerald-700" href="/cabinet">{copy.partners}</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
    {children}
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-400" id="support">
      <div className="mx-auto grid max-w-[1440px] gap-x-8 gap-y-7 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.2fr_1fr_1fr_1fr] lg:px-8">
        <div><p className="text-sm font-semibold text-white">NOVOTECH SYSTEMS</p><p className="mt-2 max-w-sm text-xs leading-5">{locale === "ro" ? "Echipamente și soluții profesionale de securitate în Moldova." : "Профессиональное оборудование и решения для безопасности в Молдове."}</p></div>
        <FooterGroup title={locale === "ro" ? "Catalog" : "Каталог"}><FooterLink href={`/catalog?lang=${locale}`}>{copy.catalog}</FooterLink><FooterLink href={`/calculator/cctv?lang=${locale}`}>{copy.chooseSystem}</FooterLink></FooterGroup>
        <FooterGroup title={locale === "ro" ? "Informații" : "Информация"}><FooterLink href={`/?lang=${locale}#installation`}>{copy.services}</FooterLink><FooterLink href={`/?lang=${locale}#delivery`}>{copy.delivery}</FooterLink></FooterGroup>
        <FooterGroup title={locale === "ro" ? "Contacte și magazine" : "Контакты и магазины"}><FooterLink href={`/?lang=${locale}#support`}>{copy.support}</FooterLink><FooterLink href="/cabinet">{copy.partners}</FooterLink><p className="text-xs leading-5 text-zinc-500">{locale === "ro" ? "Adresele și programul se confirmă înainte de vizită." : "Адреса и график уточняйте перед визитом."}</p></FooterGroup>
      </div>
    </footer>
  </div>;
}

function FooterGroup({ children, title }: { children: ReactNode; title: string }) {
  return <section><h2 className="text-xs font-semibold uppercase text-zinc-200">{title}</h2><div className="mt-3 grid gap-2 text-sm">{children}</div></section>;
}

function FooterLink({ children, href }: { children: ReactNode; href: string }) {
  return <Link className="w-fit hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500" href={href}>{children}</Link>;
}
