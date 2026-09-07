import type { FreshnessView } from "../../integration/freshness";
import {
  projectRetailPricePresentation,
  type ProductCommercialViewDto,
  type ProductPriceViewDto,
} from "../../pricing-inventory";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";

export function ProductPricingBlock({ commercialView, locale = "ru", showPartnerPrice: showPartnerPriceProp, showRetailPrice = true, variant = "card" }: { commercialView?: ProductCommercialViewDto; freshness?: FreshnessView | null; locale?: PartnerLocale; showPartnerPrice?: boolean; showRetailPrice?: boolean; variant?: "card" | "detail" | "list" }) {
  const copy = getCatalogCopy(locale);
  const prices = projectRetailPricePresentation(commercialView);
  const showPartnerPrice = showPartnerPriceProp ?? Boolean(prices.partnerPrice);
  if (variant === "list") return <div className="grid h-full min-w-0 content-center gap-0.5 bg-zinc-50 px-2 py-1.5">
    {showPartnerPrice ? <ListPrice emphasized hideLabel label={copy.partnerPrice} missingValue={copy.pricePending} secondaryValue={partnerMdlEquivalent(commercialView, copy.mdlUnavailable)} value={prices.partnerPrice?.formattedAmount} /> : null}
    {showRetailPrice ? <ListPrice emphasized={!showPartnerPrice} label={copy.retailPrice} missingValue={copy.pricePending} value={prices.retailPriceMdl?.formattedAmount} /> : null}
    {showRetailPrice && prices.msrpPriceUsd ? <ListPrice label={copy.msrp} missingValue={copy.pricePending} value={prices.msrpPriceUsd.formattedAmount} /> : null}
  </div>;
  if (variant === "card") return <div className="flex h-full min-w-0 flex-col justify-center bg-zinc-50 px-3 py-2">
    {showPartnerPrice ? <CardPrice emphasized hideLabel label={copy.partnerPrice} mdlEquivalentLabel={copy.mdlEquivalent} missingValue={copy.pricePending} secondaryValue={partnerMdlEquivalent(commercialView, copy.mdlUnavailable)} value={prices.partnerPrice?.formattedAmount} /> : null}
    {showRetailPrice ? <CardPrice emphasized={!showPartnerPrice} label={copy.retailPrice} missingValue={copy.pricePending} secondary={showPartnerPrice} value={prices.retailPriceMdl?.formattedAmount} /> : null}
    {showRetailPrice && prices.msrpPriceUsd ? <CardPrice label={copy.msrp} missingValue={copy.pricePending} secondary value={prices.msrpPriceUsd.formattedAmount} /> : null}
  </div>;

  return <div className="overflow-hidden border border-zinc-200 bg-white">
    <div className={`grid ${showPartnerPrice ? "sm:grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-2"}`}>
      {showPartnerPrice ? <DetailMetric emphasized label={copy.partnerPrice} missingValue={copy.pricePending} price={prices.partnerPriceMdl} secondaryValue={prices.partnerPriceMdl ? formatSecondaryUsd(prices.partnerPrice) : null} value={!prices.partnerPriceMdl ? formatSecondaryUsd(prices.partnerPrice) : null} warning={!prices.partnerPriceMdl && prices.partnerPrice?.currencyCode === "USD" ? copy.mdlUnavailable : undefined} /> : null}
      <DetailMetric label={copy.retailPrice} missingValue={copy.pricePending} price={prices.retailPriceMdl} />
      <DetailMetric label={copy.msrp} missingValue={copy.pricePending} price={prices.msrpPriceUsd} />
      {showPartnerPrice ? <DetailMetric label={copy.grossProfit} missingValue={copy.pricePending} value={commercialView?.commercialOpportunity?.formattedGrossProfitMdl} /> : null}
      {showPartnerPrice ? <DetailMetric label={copy.markup} missingValue={copy.pricePending} value={commercialView?.commercialOpportunity?.formattedMarkup} /> : null}
    </div>
  </div>;
}

function DetailMetric({ emphasized = false, label, missingValue, price, secondaryValue, value, warning }: { emphasized?: boolean; label: string; missingValue: string; price?: ProductPriceViewDto | null; secondaryValue?: string | null; value?: string | null; warning?: string }) {
  return <div className={`min-w-0 border-b border-r border-zinc-200 px-3 py-2.5 ${emphasized ? "bg-emerald-50" : "bg-white"}`}><p className="text-xs font-semibold text-zinc-500">{label}</p><p className={`mt-0.5 break-words font-semibold text-zinc-950 ${emphasized ? "text-lg" : "text-base"}`}>{price?.formattedAmount ?? value ?? missingValue}</p>{secondaryValue ? <p className="mt-0.5 text-xs font-medium text-zinc-600">{secondaryValue}</p> : null}{warning ? <p className="mt-1 text-xs text-amber-700">{warning}</p> : null}</div>;
}
function formatSecondaryUsd(price?: ProductPriceViewDto | null): string | null { return price?.currencyCode === "USD" && price.formattedAmount ? `${price.formattedAmount} USD` : null; }
function CardPrice({ emphasized = false, hideLabel = false, label, mdlEquivalentLabel = "MDL", missingValue, secondary = false, secondaryValue, value }: { emphasized?: boolean; hideLabel?: boolean; label: string; mdlEquivalentLabel?: string; missingValue: string; secondary?: boolean; secondaryValue?: string | null; value?: string | null }) {
  const displayValue = value ?? missingValue;
  return <div className={`min-w-0 ${secondary ? "mt-1 flex items-baseline justify-between gap-2 border-t border-zinc-200/80 pt-1" : ""}`}>
    {hideLabel ? null : <p className={`truncate font-semibold text-zinc-500 ${secondary ? "text-[10px]" : "text-[11px]"}`}>{label}</p>}
    <div className={`min-w-0 ${secondaryValue ? "mt-0.5 flex items-baseline justify-between gap-2" : ""}`}>
      <p aria-label={`${label}: ${displayValue}`} className={`truncate font-semibold ${emphasized ? hideLabel ? `font-bold text-emerald-700 ${secondaryValue ? "text-xl leading-6" : "mt-0.5 text-xl leading-6"}` : secondaryValue ? "text-lg leading-5 text-zinc-950" : "mt-0.5 text-lg leading-5 text-zinc-950" : "text-xs text-zinc-950"}`} title={displayValue}>{displayValue}</p>
      {secondaryValue ? <p aria-label={`${mdlEquivalentLabel}: ${secondaryValue}`} className="max-w-[52%] shrink-0 truncate text-right text-xs font-medium text-zinc-500" title={secondaryValue}>{secondaryValue}</p> : null}
    </div>
  </div>;
}

function ListPrice({ emphasized = false, hideLabel = false, label, missingValue, secondaryValue, value }: { emphasized?: boolean; hideLabel?: boolean; label: string; missingValue: string; secondaryValue?: string | null; value?: string | null }) {
  const displayValue = value ?? missingValue;
  return <div className="min-w-0 leading-tight">
    <div className="flex min-w-0 items-baseline justify-between gap-1.5">
      {hideLabel ? null : <p className="min-w-0 truncate text-[9px] font-semibold text-zinc-500" title={label}>{label}</p>}
      <p aria-label={`${label}: ${displayValue}`} className={`shrink-0 whitespace-nowrap font-semibold ${emphasized ? hideLabel ? "text-sm font-bold text-emerald-700" : "text-xs text-zinc-950" : "text-[10px] text-zinc-950"}`} title={displayValue}>{displayValue}</p>
    </div>
    {secondaryValue ? <p className="truncate text-right text-[9px] font-medium text-zinc-500" title={secondaryValue}>{secondaryValue}</p> : null}
  </div>;
}

function partnerMdlEquivalent(commercialView: ProductCommercialViewDto | undefined, unavailable: string): string | null {
  const partnerPrice = commercialView?.partnerPrice;
  if (!partnerPrice || partnerPrice.currencyCode === "MDL") return null;
  if (partnerPrice.currencyCode !== "USD") return null;
  return commercialView?.partnerPriceMdl?.formattedAmount ?? unavailable;
}
