import { ImageOff, PackageOpen, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PublicRetailCartItemActions } from "@/src/modules/public-retail/components/PublicRetailCartItemActions";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { availabilityCopy, availabilityTone, formatRetailPrice, publicRetailFullCatalogHref, publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { getRetailCartTokenHash } from "@/src/modules/public-retail/retail-cart-cookie";
import { getRetailCartService } from "@/src/modules/public-retail/retail-cart-server";
import { isRetailCheckoutEnabled } from "@/src/modules/public-retail/retail-checkout-server";
import type { PublicRetailCartBundleDto, PublicRetailCartDto, PublicRetailCartItemDto, PublicRetailLocale } from "@/src/modules/public-retail/types";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return { title: locale === "ro" ? "Coș | Novotech" : "Корзина | Novotech", robots: { index: false, follow: false } };
}

export default async function PublicRetailCartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const cart = await getRetailCartService().getCart(await getRetailCartTokenHash(), locale).catch(() => null);
  const quantity = cart?.totalQuantity ?? 0;

  return <PublicRetailShell cartQuantity={quantity} languagePath="/cart" locale={locale}>
    <main className="min-h-[calc(100vh-4rem)] bg-zinc-50" lang={locale}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
          <div><p className="text-xs font-semibold uppercase text-emerald-700">Novotech Retail</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{locale === "ro" ? "Coș" : "Корзина"}</h1></div>
          {quantity > 0 ? <p className="text-sm text-zinc-600">{locale === "ro" ? `${quantity} bucăți` : `${quantity} шт.`}</p> : null}
        </header>
        {!cart || cart.items.length === 0 ? <EmptyCart locale={locale} /> : <CartContent cart={cart} locale={locale} />}
      </div>
    </main>
  </PublicRetailShell>;
}

function CartContent({ cart, locale }: { cart: PublicRetailCartDto; locale: PublicRetailLocale }) {
  const ru = locale === "ru";
  const standalone = cart.items.filter((item) => item.bundleId === null);
  const hasStaleItems = cart.items.some((item) => item.stale);
  const checkoutAvailable = isRetailCheckoutEnabled() && !hasStaleItems
    && cart.totals.total !== null && !cart.items.some((item) => item.availability === "unavailable");

  return <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
    <div className="space-y-8">
      {standalone.length > 0 ? <CartGroup items={standalone} label={ru ? "Товары" : "Produse"} locale={locale} revision={cart.revision} /> : null}
      {cart.bundles.map((bundle, index) => <CartBundle bundle={bundle} index={index} items={cart.items.filter((item) => item.bundleId === bundle.id)} key={bundle.id} locale={locale} revision={cart.revision} />)}
      <div className="flex gap-3 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><p>{ru ? "Добавление в корзину не резервирует товар. Цена и доступность проверяются по текущим опубликованным данным." : "Adăugarea în coș nu rezervă produsul. Prețul și disponibilitatea sunt verificate din datele publicate curente."}</p></div>
    </div>
    <aside className="border border-zinc-200 bg-white p-5 lg:sticky lg:top-24">
      <h2 className="text-lg font-semibold">{ru ? "Итого" : "Total"}</h2>
      <dl className="mt-5 space-y-3 text-sm">
        <SummaryRow label={ru ? "Товары и оборудование" : "Produse și echipamente"} locale={locale} value={cart.totals.equipment} currency={cart.totals.currency} />
        {cart.items.some((item) => item.commercialGroup === "materials") ? <SummaryRow label={ru ? "Материалы" : "Materiale"} locale={locale} value={cart.totals.materials} currency={cart.totals.currency} /> : null}
        {cart.bundles.some((bundle) => bundle.installationPricing) ? <SummaryRow label={ru ? "Монтаж и настройка" : "Instalare și configurare"} locale={locale} value={cart.totals.installation} currency={cart.totals.currency} /> : null}
      </dl>
      <div className="mt-5 border-t border-zinc-200 pt-5"><div className="flex items-end justify-between gap-4"><span className="font-semibold">{ru ? "Текущая сумма" : "Suma curentă"}</span><strong className="text-xl tabular-nums">{money(cart.totals.total, cart.totals.currency, locale)}</strong></div></div>
      {hasStaleItems ? <p className="mt-4 text-sm leading-5 text-amber-700">{ru ? "Одна или несколько позиций больше не доступны в текущем каталоге. Итог будет показан после их удаления или повторного подбора." : "Una sau mai multe poziții nu mai sunt disponibile în catalogul curent. Totalul va fi afișat după eliminarea sau selectarea lor din nou."}</p> : null}
      {checkoutAvailable ? <Link className="mt-6 inline-flex min-h-12 w-full items-center justify-center bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800" href={`/checkout?lang=${locale}`}>{ru ? "Оформить заказ" : "Plasează comanda"}</Link> : null}
      <Link className={`${checkoutAvailable ? "mt-3" : "mt-6"} inline-flex min-h-12 w-full items-center justify-center border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50`} href={`/catalog?lang=${locale}`}>{ru ? "Продолжить выбор" : "Continuă selecția"}</Link>
      {!isRetailCheckoutEnabled() ? <p className="mt-3 text-xs leading-5 text-zinc-500">{ru ? "Оформление заказа пока доступно только в пилотном режиме." : "Plasarea comenzii este disponibilă momentan doar în regim pilot."}</p> : null}
    </aside>
  </div>;
}

function CartBundle({ bundle, items, locale, revision, index }: { bundle: PublicRetailCartBundleDto; items: PublicRetailCartItemDto[]; locale: PublicRetailLocale; revision: number; index: number }) {
  const ru = locale === "ru";
  const intent = bundle.installationIntent && Object.values(bundle.installationIntent).some(Boolean);
  return <section className="space-y-3">
    <div><p className="text-xs font-semibold uppercase text-emerald-700">{ru ? `Система ${index + 1}` : `Sistem ${index + 1}`}</p><h2 className="mt-1 text-xl font-semibold">{ru ? "Система видеонаблюдения" : "Sistem de supraveghere video"}</h2></div>
    <CartGroup items={items} locale={locale} revision={revision} />
    {intent && bundle.installationPricing ? <div className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm text-emerald-950">
      <p className="font-semibold">{ru ? "Монтаж и настройка" : "Instalare și configurare"}</p>
      <p className="mt-1">{money(bundle.installationPricing.subtotal, bundle.installationPricing.currency, locale)}</p>
    </div> : intent ? <p className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">{ru ? "Тариф на монтаж требует подтверждения." : "Tariful de instalare trebuie confirmat."}</p> : null}
  </section>;
}

function CartGroup({ items, label, locale, revision }: { items: PublicRetailCartItemDto[]; label?: string; locale: PublicRetailLocale; revision: number }) {
  return <section>{label ? <h2 className="mb-3 text-xl font-semibold">{label}</h2> : null}<div className="divide-y divide-zinc-200 border-y border-zinc-200 bg-white">{items.map((item) => <CartLine item={item} key={`${revision}:${item.bundleId ?? "standalone"}:${item.publicProductId}`} locale={locale} revision={revision} />)}</div></section>;
}

function CartLine({ item, locale, revision }: { item: PublicRetailCartItemDto; locale: PublicRetailLocale; revision: number }) {
  const ru = locale === "ru";
  const media = <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden border border-zinc-200 bg-zinc-50">{item.image ? <Image alt={item.image.alt} className="object-contain p-2" fill sizes="80px" src={item.image.url} /> : <ImageOff aria-hidden="true" className="size-7 text-zinc-300" />}</div>;
  const name = item.slug ? <Link className="font-semibold leading-5 hover:text-emerald-700" href={`/products/${item.slug}?lang=${locale}`}>{item.name}</Link> : <p className="font-semibold leading-5">{item.name}</p>;

  return <article className="grid gap-4 p-4 sm:grid-cols-[80px_minmax(0,1fr)_auto] sm:items-center">
    {item.slug ? <Link aria-label={item.name} href={`/products/${item.slug}?lang=${locale}`}>{media}</Link> : media}
    <div className="min-w-0">{name}<p className="mt-1 text-xs text-zinc-500">{ru ? "Артикул" : "Cod"}: {item.sku}</p><p className={`mt-2 text-sm font-medium ${availabilityTone(item.availability)}`}>{availabilityCopy[locale][item.availability]}</p>{item.stale ? <p className="mt-2 text-sm text-amber-700">{ru ? "Позиция больше не доступна в текущем каталоге." : "Poziția nu mai este disponibilă în catalogul curent."}</p> : null}{item.priceChanged ? <p className="mt-2 text-sm text-amber-700">{ru ? "Цена изменилась с момента добавления." : "Prețul s-a modificat de la adăugare."}</p> : null}<p className="mt-2 text-sm text-zinc-600">{item.price ? money(item.price.amount, item.price.currency, locale) : "—"} / {unitLabel(item.unitCode, locale)}</p></div>
    <div className="space-y-3 sm:text-right"><p className="text-lg font-semibold tabular-nums">{item.lineAmount !== null && item.price ? money(item.lineAmount, item.price.currency, locale) : "—"}</p><PublicRetailCartItemActions bundleId={item.bundleId} locale={locale} publicProductId={item.publicProductId} quantity={item.quantity} revision={revision} /></div>
  </article>;
}

function EmptyCart({ locale }: { locale: PublicRetailLocale }) {
  const ru = locale === "ru";
  return <section className="mx-auto grid max-w-lg justify-items-center py-20 text-center"><PackageOpen aria-hidden="true" className="size-12 text-zinc-300" /><h2 className="mt-5 text-2xl font-semibold">{ru ? "Корзина пуста" : "Coșul este gol"}</h2><p className="mt-3 text-sm leading-6 text-zinc-600">{ru ? "Добавьте отдельный товар или готовую систему видеонаблюдения." : "Adăugați un produs sau un sistem de supraveghere video configurat."}</p><Link className="mt-6 inline-flex min-h-12 items-center justify-center bg-emerald-700 px-5 text-sm font-semibold text-white" href={publicRetailFullCatalogHref(locale)}>{ru ? "Перейти в каталог" : "Deschide catalogul"}</Link></section>;
}

function SummaryRow({ label, value, currency, locale }: { label: string; value: number | null; currency: string | null; locale: PublicRetailLocale }) {
  return <div className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-semibold tabular-nums">{money(value, currency, locale)}</dd></div>;
}

function money(value: number | null, currency: string | null, locale: PublicRetailLocale) {
  return value !== null && currency ? formatRetailPrice(value, currency, locale) : "—";
}
function unitLabel(unit: PublicRetailCartItemDto["unitCode"], locale: PublicRetailLocale) { if (unit === "meter") return "m"; if (unit === "service") return locale === "ru" ? "усл." : "serv."; return locale === "ru" ? "шт." : "buc."; }
