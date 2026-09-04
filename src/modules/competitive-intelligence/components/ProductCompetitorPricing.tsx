import Link from "next/link";

import { formatPartnerDate, type PartnerLocale } from "../../partner-locale";
import { formatCompetitiveMoney, formatCompetitivePercent } from "../service";
import type { ProductCompetitorPricingItem } from "../types";

export function ProductCompetitorPricing({
  analyticsHref = "?tab=analytics",
  items,
  locale,
}: {
  analyticsHref?: string;
  items: ProductCompetitorPricingItem[];
  locale: PartnerLocale;
}) {
  if (!items.length) return null;
  const copy = pricingCopy(locale);
  return (
    <section aria-labelledby="competitor-pricing-heading" className="mt-4">
      <h2 className="text-base font-semibold leading-6 text-zinc-950" id="competitor-pricing-heading">{copy.heading}</h2>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <article className="border border-zinc-200 bg-zinc-50 p-3" key={item.competitorId}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-950">{item.competitorName}</h3>
              <span className="text-xs text-zinc-500">
                {copy.retailFrom} {formatPartnerDate(item.retailEffectiveDate, locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <PriceValue label={copy.retailPrice} value={money(item.retailPrice, item.retailCurrency, locale)} />
              {item.ownPrice !== null && item.ownCurrency ? (
                <PriceValue
                  detail={item.ownQuantity && item.ownQuantity > 1 ? `${copy.forQuantity} ${quantity(item.ownQuantity, locale)} ${copy.pieces}` : undefined}
                  label={`${copy.ownPrice} ${item.competitorName}`}
                  value={money(item.ownPrice, item.ownCurrency, locale)}
                />
              ) : null}
            </div>
            {item.ownPrice !== null ? (
              <div className="mt-3 grid gap-3 border-t border-zinc-200 pt-3 sm:grid-cols-2">
                <RetailDifference copy={copy} item={item} locale={locale} />
                <NovotechDifference copy={copy} item={item} locale={locale} />
              </div>
            ) : (
              <div className="mt-3 border-t border-zinc-200 pt-3 text-sm">
                <p className="text-zinc-600">{copy.noOwnPrice}</p>
                <Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-emerald-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" href={analyticsHref} prefetch={false}>
                  {copy.addOwnPrice}
                </Link>
              </div>
            )}
            {item.ownObservationDate ? (
              <p className="mt-2 text-xs text-zinc-500">
                {copy.observedAt} {formatPartnerDate(item.ownObservationDate, locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}
                {" · "}<Link className="font-medium text-emerald-800 hover:underline" href={analyticsHref} prefetch={false}>{copy.updatePrice}</Link>
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function RetailDifference({ copy, item, locale }: { copy: ReturnType<typeof pricingCopy>; item: ProductCompetitorPricingItem; locale: PartnerLocale }) {
  if (item.retailDiscountAmount === null || item.retailDiscountPercent === null) {
    return <p className="text-xs text-zinc-600">{comparisonMessage(item.retailComparisonStatus, copy)}</p>;
  }
  const isDiscount = item.retailDiscountAmount >= 0;
  return <div><p className="text-xs font-medium text-zinc-500">{isDiscount ? copy.retailDiscount : copy.retailDifference}</p><p className="mt-1 text-sm font-semibold tabular-nums">{isDiscount ? "−" : "+"}{money(Math.abs(item.retailDiscountAmount), item.ownCurrency ?? item.retailCurrency, locale)} / {isDiscount ? "−" : "+"}{formatCompetitivePercent(Math.abs(item.retailDiscountPercent), locale)}</p></div>;
}

function NovotechDifference({ copy, item, locale }: { copy: ReturnType<typeof pricingCopy>; item: ProductCompetitorPricingItem; locale: PartnerLocale }) {
  if (item.novotechPrice === null || !item.novotechCurrency) return <p className="text-xs text-zinc-600">{copy.novotechUnavailable}</p>;
  return <div><p className="text-xs font-medium text-zinc-500">{copy.novotechPrice}</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(item.novotechPrice, item.novotechCurrency, locale)}</p>{item.comparisonStatus === "comparable" && item.novotechDifferenceAmount !== null && item.novotechDifferencePercent !== null ? <p className={`mt-1 text-xs font-semibold ${item.novotechDifferenceAmount >= 0 ? "text-emerald-700" : "text-amber-800"}`}>{item.novotechDifferenceAmount >= 0 ? copy.novotechBenefit : copy.novotechHigher}: {money(Math.abs(item.novotechDifferenceAmount), item.novotechCurrency, locale)} / {formatCompetitivePercent(Math.abs(item.novotechDifferencePercent), locale)}</p> : <p className="mt-1 text-xs text-zinc-600">{comparisonMessage(item.comparisonStatus, copy)}</p>}</div>;
}

function comparisonMessage(status: ProductCompetitorPricingItem["comparisonStatus"], copy: ReturnType<typeof pricingCopy>) {
  if (status === "currency_mismatch") return copy.currencyMismatch;
  if (status === "vat_unknown") return copy.vatUnknown;
  if (status === "vat_mismatch" || status === "vat_not_comparable") return copy.vatMismatch;
  if (status === "stale_novotech_price" || status === "stale_competitor_price") return copy.stalePrice;
  return copy.comparisonUnavailable;
}

function PriceValue({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return <div><p className="text-xs font-medium text-zinc-500">{label}</p><p className="mt-1 text-base font-semibold tabular-nums text-zinc-950">{value}</p>{detail ? <p className="mt-0.5 text-xs text-zinc-600">{detail}</p> : null}</div>;
}

function money(value: number, currency: string, locale: PartnerLocale) {
  return formatCompetitiveMoney(value, currency, locale);
}
function quantity(value: number, locale: PartnerLocale) {
  return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { maximumFractionDigits: 4 }).format(value);
}
function pricingCopy(locale: PartnerLocale) {
  return locale === "ro" ? {
    heading: "Prețurile concurenților", retailFrom: "Preț de retail din", retailPrice: "Prețul de retail al concurentului",
    ownPrice: "Prețul dvs. la", forQuantity: "pentru", pieces: "buc.", retailDiscount: "Reducere față de retail",
    retailDifference: "Preț peste retail", novotechPrice: "Prețul dvs. Novotech", novotechBenefit: "Avantajul dvs. cu Novotech",
    novotechHigher: "Novotech este mai scump cu", currencyMismatch: "Comparația nu este disponibilă — monede diferite.",
    novotechUnavailable: "Prețul Novotech nu este disponibil pentru comparație.", vatUnknown: "Comparația nu este disponibilă — baza TVA nu este confirmată.",
    vatMismatch: "Comparația nu este disponibilă — bazele TVA diferă.", stalePrice: "Comparația nu este disponibilă — unul dintre prețuri nu este actual.", comparisonUnavailable: "Valorile au baze diferite și nu sunt comparabile exact.",
    noOwnPrice: "Ați primit un preț individual? Salvați-l în «Analiză» — comparația cu prețul dvs. Novotech va apărea aici.",
    addOwnPrice: "Adăugați prețul dvs.", observedAt: "Preț observat la", updatePrice: "Actualizați prețul",
  } : {
    heading: "Цены конкурентов", retailFrom: "Розничная цена от", retailPrice: "Розничная цена конкурента",
    ownPrice: "Ваша цена у", forQuantity: "при", pieces: "шт.", retailDiscount: "Скидка от розничной",
    retailDifference: "Цена выше розничной", novotechPrice: "Ваша цена Novotech", novotechBenefit: "Ваша выгода с Novotech",
    novotechHigher: "Novotech выше на", currencyMismatch: "Сравнение недоступно — разные валюты.",
    novotechUnavailable: "Цена Novotech недоступна для сравнения.", vatUnknown: "Сравнение недоступно — база НДС не подтверждена.",
    vatMismatch: "Сравнение недоступно — базы НДС не совпадают.", stalePrice: "Сравнение недоступно — одна из цен устарела.", comparisonUnavailable: "Значения имеют разные базы и точно несравнимы.",
    noOwnPrice: "Получили индивидуальную цену? Сохраните её в разделе «Аналитика» — здесь появится сравнение с вашей ценой Novotech.",
    addOwnPrice: "Добавить свою цену", observedAt: "Цена получена", updatePrice: "Обновить цену",
  };
}
