import { CircleUserRound, Mail, MapPin, Menu, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { retailCopy } from "../presentation";
import { publicCompanyContent } from "../public-company-content";
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
    [copy.contacts, `/contacts?lang=${locale}`],
  ] as const;

  return <div className="min-h-screen bg-white text-zinc-950">
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-17 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link aria-label="Novotech Systems Distribution" className="flex min-h-11 shrink-0 items-center gap-2.5" href={`/?lang=${locale}`}>
          <span className="grid size-9 place-items-center rounded-sm bg-emerald-700 text-white"><ShieldCheck aria-hidden="true" className="size-5" /></span>
          <span className="min-w-0 leading-none">
            <span className="block text-sm font-bold sm:text-base">NOVOTECH <span className="hidden sm:inline">SYSTEMS</span></span>
            <span className="mt-1 block text-[10px] font-medium leading-3 text-zinc-500">DISTRIBUTION</span>
          </span>
        </Link>
        <nav aria-label="Основная навигация" className="ml-auto hidden items-center gap-3 xl:flex">
          {links.map(([label, href]) => <Link className="text-[13px] font-medium text-zinc-700 hover:text-emerald-700" href={href} key={href}>{label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-1 xl:ml-0">
          <div className="hidden items-center md:flex">
            <Link aria-current={locale === "ru" ? "page" : undefined} className={`min-h-11 px-2 py-3 text-xs font-semibold ${locale === "ru" ? "text-emerald-700" : "text-zinc-500"}`} href={languageHref("ru")}>RU</Link>
            <span aria-hidden="true" className="text-zinc-300">/</span>
            <Link aria-current={locale === "ro" ? "page" : undefined} className={`min-h-11 px-2 py-3 text-xs font-semibold ${locale === "ro" ? "text-emerald-700" : "text-zinc-500"}`} href={languageHref("ro")}>RO</Link>
          </div>
          <Link aria-label={copy.partnerCabinet} className="grid size-11 shrink-0 place-items-center rounded-sm text-zinc-700 hover:bg-zinc-100 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href="/cabinet">
            <CircleUserRound aria-hidden="true" className="size-5" />
          </Link>
          <PublicRetailCartBadge locale={locale} totalQuantity={cartQuantity} />
          <details className="relative xl:hidden">
            <summary aria-label={copy.menu} className="grid size-11 cursor-pointer list-none place-items-center rounded-sm hover:bg-zinc-100"><Menu aria-hidden="true" className="size-5" /></summary>
            <nav aria-label="Мобильная навигация" className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] border border-zinc-200 bg-white p-2 shadow-xl">
              {links.map(([label, href]) => <Link className="flex min-h-11 items-center px-3 text-sm font-medium hover:bg-zinc-50" href={href} key={href}>{label}</Link>)}
              <div className="flex min-h-11 items-center border-t border-zinc-100 px-1">
                <Link aria-current={locale === "ru" ? "page" : undefined} className={`inline-flex min-h-11 items-center px-3 text-xs font-semibold ${locale === "ru" ? "text-emerald-700" : "text-zinc-500"}`} href={languageHref("ru")}>RU</Link>
                <span aria-hidden="true" className="text-zinc-300">/</span>
                <Link aria-current={locale === "ro" ? "page" : undefined} className={`inline-flex min-h-11 items-center px-3 text-xs font-semibold ${locale === "ro" ? "text-emerald-700" : "text-zinc-500"}`} href={languageHref("ro")}>RO</Link>
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
    {children}
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-400" id="support">
      <div className="mx-auto grid max-w-[1440px] gap-x-8 gap-y-7 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.2fr_.8fr_.8fr_1.4fr] lg:px-8">
        <div><p className="text-sm font-semibold text-white">NOVOTECH SYSTEMS <span className="ml-1 text-xs font-medium text-zinc-400">DISTRIBUTION</span></p><p className="mt-2 max-w-sm text-xs leading-5">{publicCompanyContent.descriptor[locale]}</p></div>
        <FooterGroup title={locale === "ro" ? "Catalog" : "Каталог"}><FooterLink href={`/catalog?lang=${locale}`}>{copy.catalog}</FooterLink><FooterLink href={`/calculator/cctv?lang=${locale}`}>{copy.chooseSystem}</FooterLink></FooterGroup>
        <FooterGroup title={locale === "ro" ? "Informații" : "Информация"}><FooterLink href={`/?lang=${locale}#installation`}>{copy.services}</FooterLink><FooterLink href={`/?lang=${locale}#delivery`}>{copy.delivery}</FooterLink></FooterGroup>
        <FooterGroup title={locale === "ro" ? "Contacte și magazine" : "Контакты и магазины"}>
          {publicCompanyContent.stores.map((store) => <a className="flex w-fit gap-2 text-xs leading-5 hover:text-white" href={store.mapsHref} key={store.mapsHref} rel="noopener noreferrer" target="_blank"><MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{store.city[locale]}, {store.address[locale]}</a>)}
          <a className="flex w-fit items-center gap-2 text-xs hover:text-white" href={publicCompanyContent.customerPhone.href}><Phone aria-hidden="true" className="size-3.5" />{publicCompanyContent.customerPhone.display}</a>
          <a className="flex w-fit items-center gap-2 text-xs hover:text-white" href={`mailto:${publicCompanyContent.email}`}><Mail aria-hidden="true" className="size-3.5" />{publicCompanyContent.email}</a>
          <p className="text-xs leading-5 text-zinc-500">{publicCompanyContent.hours.weekdays[locale]} · {publicCompanyContent.hours.saturday[locale]}</p>
          <FooterLink href={`/contacts?lang=${locale}`}>{copy.contacts}</FooterLink>
        </FooterGroup>
      </div>
      <div className="mx-auto max-w-[1440px] border-t border-zinc-800 px-4 py-4 text-xs text-zinc-500 sm:px-6 lg:px-8">© 2010–{new Date().getFullYear()} Novotech Systems. {locale === "ro" ? "Toate drepturile rezervate." : "Все права защищены."}</div>
    </footer>
  </div>;
}

function FooterGroup({ children, title }: { children: ReactNode; title: string }) {
  return <section><h2 className="text-xs font-semibold uppercase text-zinc-200">{title}</h2><div className="mt-3 grid gap-2 text-sm">{children}</div></section>;
}

function FooterLink({ children, href }: { children: ReactNode; href: string }) {
  return <Link className="w-fit hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500" href={href}>{children}</Link>;
}
