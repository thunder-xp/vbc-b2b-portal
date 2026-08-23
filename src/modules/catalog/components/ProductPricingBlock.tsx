import type { FreshnessView } from "../../integration/freshness";
import type { ProductCommercialViewDto, ProductPriceViewDto } from "../../pricing-inventory";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";

export function ProductPricingBlock({ commercialView, freshness, locale = "ru", showPartnerPrice: showPartnerPriceProp, showRetailPrice = true, variant = "card" }: { commercialView?: ProductCommercialViewDto; freshness?: FreshnessView | null; locale?: PartnerLocale; showPartnerPrice?: boolean; showRetailPrice?: boolean; variant?: "card" | "detail" }) {
  const copy = getCatalogCopy(locale);
  const showPartnerPrice = showPartnerPriceProp ?? Boolean(commercialView?.partnerPrice);
  if (variant === "card") return <div className="flex h-full min-w-0 flex-col justify-center rounded-md bg-zinc-50 px-3 py-2">
    {showPartnerPrice ? <CardPrice emphasized label={copy.partnerPrice} mdlEquivalentLabel={copy.mdlEquivalent} missingValue={copy.pricePending} secondaryValue={partnerMdlEquivalent(commercialView, copy.mdlUnavailable)} value={commercialView?.partnerPrice?.formattedAmount} /> : null}
    {showRetailPrice ? <CardPrice emphasized={!showPartnerPrice} label={copy.retailPrice} missingValue={copy.pricePending} secondary={showPartnerPrice} value={commercialView?.retailPrice?.formattedAmount} /> : null}
  </div>;

  return <div className="overflow-hidden border border-zinc-200 bg-white">
    <div className={`grid ${showPartnerPrice ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-1"}`}>
      {showPartnerPrice ? <DetailMetric emphasized label={copy.partnerPrice} missingValue={copy.pricePending} price={commercialView?.partnerPriceMdl} secondaryValue={commercialView?.partnerPriceMdl ? formatSecondaryUsd(commercialView?.partnerPrice) : null} value={!commercialView?.partnerPriceMdl ? formatSecondaryUsd(commercialView?.partnerPrice) : null} warning={!commercialView?.partnerPriceMdl && commercialView?.partnerPrice?.currencyCode === "USD" ? copy.mdlUnavailable : undefined} /> : null}
      <DetailMetric label={copy.retailPrice} missingValue={copy.pricePending} price={commercialView?.retailPrice} secondaryValue={commercialView?.msrpPriceUsd?.formattedAmount} value={!commercialView?.retailPrice ? commercialView?.msrpPriceUsd?.formattedAmount : null} warning={!commercialView?.retailPrice && commercialView?.msrpPriceUsd ? copy.mdlUnavailable : undefined} />
      {showPartnerPrice ? <DetailMetric label={copy.grossProfit} missingValue={copy.pricePending} value={commercialView?.commercialOpportunity?.formattedGrossProfitMdl} /> : null}
      {showPartnerPrice ? <DetailMetric label={copy.markup} missingValue={copy.pricePending} value={commercialView?.commercialOpportunity?.formattedMarkup} /> : null}
    </div>
    {visibleFreshness(commercialView?.commercialRateFreshness ?? freshness) ? <div className="border-t border-zinc-200 px-3 py-1.5 text-xs text-zinc-500"><p>{freshnessLabel(commercialView?.commercialRateFreshness ?? freshness!, copy)}</p></div> : null}
  </div>;
}

function DetailMetric({ emphasized = false, label, missingValue, price, secondaryValue, value, warning }: { emphasized?: boolean; label: string; missingValue: string; price?: ProductPriceViewDto | null; secondaryValue?: string | null; value?: string | null; warning?: string }) {
  return <div className={`min-w-0 border-b border-r border-zinc-200 px-3 py-2.5 ${emphasized ? "bg-emerald-50" : "bg-white"}`}><p className="text-xs font-semibold text-zinc-500">{label}</p><p className={`mt-0.5 break-words font-semibold text-zinc-950 ${emphasized ? "text-lg" : "text-base"}`}>{price?.formattedAmount ?? value ?? missingValue}</p>{secondaryValue ? <p className="mt-0.5 text-xs font-medium text-zinc-600">{secondaryValue}</p> : null}{warning ? <p className="mt-1 text-xs text-amber-700">{warning}</p> : null}</div>;
}
function visibleFreshness(freshness?: FreshnessView | null): freshness is FreshnessView { return freshness?.status === "aging" || freshness?.status === "stale"; }
function formatSecondaryUsd(price?: ProductPriceViewDto | null): string | null { return price?.currencyCode === "USD" && price.formattedAmount ? `${price.formattedAmount} USD` : null; }
function CardPrice({ emphasized = false, label, mdlEquivalentLabel = "MDL", missingValue, secondary = false, secondaryValue, value }: { emphasized?: boolean; label: string; mdlEquivalentLabel?: string; missingValue: string; secondary?: boolean; secondaryValue?: string | null; value?: string | null }) {
  const displayValue = value ?? missingValue;
  return <div className={`min-w-0 ${secondary ? "mt-1 flex items-baseline justify-between gap-2 border-t border-zinc-200/80 pt-1" : ""}`}>
    <p className={`truncate font-semibold text-zinc-500 ${secondary ? "text-[10px]" : "text-[11px]"}`}>{label}</p>
    <div className={`min-w-0 ${secondaryValue ? "mt-0.5 flex items-baseline justify-between gap-2" : ""}`}>
      <p aria-label={`${label}: ${displayValue}`} className={`truncate font-semibold text-zinc-950 ${emphasized ? secondaryValue ? "text-lg leading-5" : "mt-0.5 text-lg leading-5" : "text-xs"}`} title={displayValue}>{displayValue}</p>
      {secondaryValue ? <p aria-label={`${mdlEquivalentLabel}: ${secondaryValue}`} className="max-w-[52%] shrink-0 truncate text-right text-xs font-medium text-zinc-500" title={secondaryValue}>{secondaryValue}</p> : null}
    </div>
  </div>;
}

function partnerMdlEquivalent(commercialView: ProductCommercialViewDto | undefined, unavailable: string): string | null {
  const partnerPrice = commercialView?.partnerPrice;
  if (!partnerPrice || partnerPrice.currencyCode === "MDL") return null;
  if (partnerPrice.currencyCode !== "USD") return null;
  return commercialView?.partnerPriceMdl?.formattedAmount ?? unavailable;
}

function freshnessLabel(freshness: FreshnessView, copy: ReturnType<typeof getCatalogCopy>): string {
  if (freshness.status === "fresh") return copy.commercialDataFresh;
  if (freshness.status === "aging") return copy.commercialDataAging;
  if (freshness.status === "stale") return copy.commercialDataStale;
  return copy.commercialDataUnknown;
}
