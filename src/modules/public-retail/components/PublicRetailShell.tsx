import { CircleUserRound, Mail, MapPin, Menu, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { publicRetailShowcaseHref, retailCopy } from "../presentation";
import { publicCompanyContent } from "../public-company-content";
import type { PublicRetailLocale } from "../types";
import { PublicRetailCartBadge } from "./PublicRetailCartBadge";

type Props = { children: ReactNode; locale: PublicRetailLocale; languagePath: string; cartQuantity?: number };

export function PublicRetailShell({ children, locale, languagePath, cartQuantity }: Props) {
  const copy = retailCopy[locale];
  const ru = locale === "ru";
  const catalogLabel = ru ? "Каталог" : "Catalog";
  const languageHref = (next: PublicRetailLocale) => `${languagePath}${languagePath.includes("?") ? "&" : "?"}lang=${next}`;
  const links = [
    [catalogLabel, publicRetailShowcaseHref(locale)],
    [ru ? "Решения" : "Soluții", `/calculator/cctv?lang=${locale}`],
    [copy.services, `/installation?lang=${locale}`],
    [copy.delivery, `/?lang=${locale}#delivery`],
    [ru ? "О компании" : "Despre noi", `/about?lang=${locale}`],
    [copy.contacts, `/contacts?lang=${locale}`],
  ] as const;

  return <div className="public-retail min-h-screen bg-white text-zinc-950" lang={locale}>
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center gap-3">
          <Link aria-label="Novotech Systems Distribution" className="flex min-h-12 shrink-0 items-center gap-2" href={`/?lang=${locale}`}>
            <OfficialLogo background="light" priority />
            <span className="hidden leading-none sm:block">
              <strong className="block text-[11px] font-semibold text-zinc-950">NOVOTECH SYSTEMS</strong>
              <span className="mt-1 block text-[10px] font-medium text-zinc-500">DISTRIBUTION</span>
            </span>
          </Link>
          <nav aria-label={ru ? "Основная навигация" : "Navigare principală"} className="ml-auto hidden items-center gap-4 xl:flex">
            {links.map(([label, href]) => <Link className="text-[13px] font-medium text-zinc-700 hover:text-blue-700" href={href} key={href}>{label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-1 xl:ml-0">
            <div className="hidden items-center md:flex">
              <Link aria-current={locale === "ru" ? "page" : undefined} className={`inline-flex min-h-11 items-center px-2 text-xs font-semibold ${locale === "ru" ? "text-blue-700" : "text-zinc-500"}`} href={languageHref("ru")}>RU</Link>
              <span aria-hidden="true" className="text-zinc-300">/</span>
              <Link aria-current={locale === "ro" ? "page" : undefined} className={`inline-flex min-h-11 items-center px-2 text-xs font-semibold ${locale === "ro" ? "text-blue-700" : "text-zinc-500"}`} href={languageHref("ro")}>RO</Link>
            </div>
            <Link aria-label={copy.partnerCabinet} className="grid size-11 shrink-0 place-items-center rounded-sm text-zinc-700 hover:bg-zinc-100 hover:text-blue-700" href="/cabinet">
              <CircleUserRound aria-hidden="true" className="size-5" />
            </Link>
            <PublicRetailCartBadge locale={locale} totalQuantity={cartQuantity} />
            <details className="relative xl:hidden">
              <summary aria-label={copy.menu} className="grid size-11 cursor-pointer list-none place-items-center rounded-sm hover:bg-zinc-100"><Menu aria-hidden="true" className="size-5" /></summary>
              <nav aria-label={ru ? "Мобильная навигация" : "Navigare mobilă"} className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] border border-zinc-200 bg-white p-2 shadow-xl">
                {links.map(([label, href]) => <Link className="flex min-h-11 items-center px-3 text-sm font-medium hover:bg-blue-50 hover:text-blue-800" href={href} key={href}>{label}</Link>)}
                <div className="flex min-h-11 items-center border-t border-zinc-100 px-1">
                  <Link aria-current={locale === "ru" ? "page" : undefined} className={`inline-flex min-h-11 items-center px-3 text-xs font-semibold ${locale === "ru" ? "text-blue-700" : "text-zinc-500"}`} href={languageHref("ru")}>RU</Link>
                  <span aria-hidden="true" className="text-zinc-300">/</span>
                  <Link aria-current={locale === "ro" ? "page" : undefined} className={`inline-flex min-h-11 items-center px-3 text-xs font-semibold ${locale === "ro" ? "text-blue-700" : "text-zinc-500"}`} href={languageHref("ro")}>RO</Link>
                </div>
              </nav>
            </details>
          </div>
        </div>
      </div>
    </header>
    {children}
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-400" id="support">
      <div className="mx-auto grid max-w-[1440px] gap-x-7 gap-y-8 px-4 py-9 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8 xl:grid-cols-[1.3fr_.75fr_.75fr_.85fr_1.3fr]">
        <div><OfficialLogo background="dark" /><p className="mt-4 max-w-sm text-xs leading-5">{publicCompanyContent.descriptor[locale]}</p></div>
        <FooterGroup title={catalogLabel}><FooterLink href={`/catalog?lang=${locale}&view=all`}>{catalogLabel}</FooterLink><FooterLink href={`/calculator/cctv?lang=${locale}`}>{copy.chooseSystem}</FooterLink></FooterGroup>
        <FooterGroup title={ru ? "Услуги" : "Servicii"}><FooterLink href={`/installation?lang=${locale}`}>{copy.services}</FooterLink><FooterLink href={`/?lang=${locale}#delivery`}>{copy.delivery}</FooterLink></FooterGroup>
        <FooterGroup title={ru ? "Информация" : "Informații"}><FooterLink href={`/about?lang=${locale}`}>{ru ? "О компании" : "Despre companie"}</FooterLink><FooterLink href={`/guides?lang=${locale}`}>{ru ? "Полезные материалы" : "Ghiduri utile"}</FooterLink><FooterLink href={`/partners?lang=${locale}`}>{copy.partners}</FooterLink></FooterGroup>
        <FooterGroup title={ru ? "Контакты" : "Contacte"}>
          {publicCompanyContent.stores.map((store) => <a className="flex w-fit gap-2 text-xs leading-5 hover:text-white" href={store.mapsHref} key={store.mapsHref} rel="noopener noreferrer" target="_blank"><MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{store.city[locale]}, {store.address[locale]}</a>)}
          <a className="flex w-fit items-center gap-2 text-xs hover:text-white" href={publicCompanyContent.customerPhone.href}><Phone aria-hidden="true" className="size-3.5" />{publicCompanyContent.customerPhone.display}</a>
          <a className="flex w-fit items-center gap-2 text-xs hover:text-white" href={`mailto:${publicCompanyContent.email}`}><Mail aria-hidden="true" className="size-3.5" />{publicCompanyContent.email}</a>
          <p className="text-xs leading-5 text-zinc-500">{publicCompanyContent.hours.weekdays[locale]} · {publicCompanyContent.hours.saturday[locale]}</p>
          <FooterLink href={`/contacts?lang=${locale}`}>{copy.contacts}</FooterLink>
        </FooterGroup>
      </div>
      <div className="mx-auto max-w-[1440px] border-t border-zinc-800 px-4 py-4 text-xs text-zinc-500 sm:px-6 lg:px-8">© 2010–{new Date().getFullYear()} Novotech. {ru ? "Все права защищены." : "Toate drepturile rezervate."}</div>
    </footer>
  </div>;
}

function FooterGroup({ children, title }: { children: ReactNode; title: string }) {
  return <section><h2 className="text-xs font-semibold uppercase text-zinc-200">{title}</h2><div className="mt-3 grid gap-2 text-sm">{children}</div></section>;
}

function OfficialLogo({ background, priority = false }: { background: "light" | "dark"; priority?: boolean }) {
  return <Image
    alt="Novotech"
    className="size-14 shrink-0 object-contain sm:size-16"
    height={64}
    preload={priority}
    src={`/brand/source/novotech-logo-${background}-original.webp`}
    width={64}
  />;
}

function FooterLink({ children, href }: { children: ReactNode; href: string }) {
  return <Link className="w-fit hover:text-white" href={href}>{children}</Link>;
}
