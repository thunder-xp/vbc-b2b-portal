import type { FreshnessView } from "../../integration/freshness";
import type { ProductCommercialViewDto, ProductPriceViewDto } from "../../pricing-inventory";

export function ProductPricingBlock({ commercialView, freshness, showPartnerPrice: showPartnerPriceProp, showRetailPrice = true, variant = "card" }: { commercialView?: ProductCommercialViewDto; freshness?: FreshnessView | null; showPartnerPrice?: boolean; showRetailPrice?: boolean; variant?: "card" | "detail" }) {
  const showPartnerPrice = showPartnerPriceProp ?? Boolean(commercialView?.partnerPrice);
  if (variant === "card") return <div className="flex h-full min-w-0 flex-col justify-center rounded-md bg-zinc-50 px-3 py-2">
    {showPartnerPrice ? <CardPrice emphasized label="Ваша цена" secondaryValue={partnerMdlEquivalent(commercialView)} value={commercialView?.partnerPrice?.formattedAmount} /> : null}
    {showRetailPrice ? <CardPrice emphasized={!showPartnerPrice} label="Розничная цена" secondary={showPartnerPrice} value={commercialView?.retailPrice?.formattedAmount} /> : null}
  </div>;

  return <div className="overflow-hidden border border-zinc-200 bg-white">
    <div className={`grid ${showPartnerPrice ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-1"}`}>
      {showPartnerPrice ? <DetailMetric emphasized label="Ваша цена" price={commercialView?.partnerPriceMdl} secondaryValue={commercialView?.partnerPriceMdl ? formatSecondaryUsd(commercialView?.partnerPrice) : null} value={!commercialView?.partnerPriceMdl ? formatSecondaryUsd(commercialView?.partnerPrice) : null} warning={!commercialView?.partnerPriceMdl && commercialView?.partnerPrice?.currencyCode === "USD" ? "Цена в MDL временно недоступна" : undefined} /> : null}
      <DetailMetric label="Розничная цена" price={commercialView?.retailPrice} secondaryValue={commercialView?.msrpPriceUsd?.formattedAmount} value={!commercialView?.retailPrice ? commercialView?.msrpPriceUsd?.formattedAmount : null} warning={!commercialView?.retailPrice && commercialView?.msrpPriceUsd ? "Цена в MDL временно недоступна" : undefined} />
      {showPartnerPrice ? <DetailMetric label="Валовая прибыль" value={commercialView?.commercialOpportunity?.formattedGrossProfitMdl} /> : null}
      {showPartnerPrice ? <DetailMetric label="Наценка" value={commercialView?.commercialOpportunity?.formattedMarkup} /> : null}
    </div>
    {commercialView?.commercialRateFreshness ? <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500"><p>{commercialView.commercialRateFreshness.label}</p></div> : freshness ? <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500"><p>{freshness.label}</p></div> : null}
  </div>;
}

function DetailMetric({ emphasized = false, label, price, secondaryValue, value, warning }: { emphasized?: boolean; label: string; price?: ProductPriceViewDto | null; secondaryValue?: string | null; value?: string | null; warning?: string }) {
  return <div className={`min-w-0 border-b border-r border-zinc-200 px-4 py-4 ${emphasized ? "bg-emerald-50" : "bg-white"}`}><p className="text-xs font-semibold text-zinc-500">{label}</p><p className={`mt-1 break-words font-semibold text-zinc-950 ${emphasized ? "text-xl" : "text-base"}`}>{price?.formattedAmount ?? value ?? "Цена уточняется"}</p>{secondaryValue ? <p className="mt-1 text-sm font-medium text-zinc-600">{secondaryValue}</p> : null}{warning ? <p className="mt-2 text-xs text-amber-700">{warning}</p> : null}</div>;
}
function formatSecondaryUsd(price?: ProductPriceViewDto | null): string | null { return price?.currencyCode === "USD" && price.formattedAmount ? `${price.formattedAmount} USD` : null; }
function CardPrice({ emphasized = false, label, secondary = false, secondaryValue, value }: { emphasized?: boolean; label: string; secondary?: boolean; secondaryValue?: string | null; value?: string | null }) {
  const displayValue = value ?? "Цена уточняется";
  return <div className={`min-w-0 ${secondary ? "mt-1 flex items-baseline justify-between gap-2 border-t border-zinc-200/80 pt-1" : ""}`}>
    <p className={`truncate font-semibold text-zinc-500 ${secondary ? "text-[10px]" : "text-[11px]"}`}>{label}</p>
    <div className={`min-w-0 ${secondaryValue ? "mt-0.5 flex items-baseline justify-between gap-2" : ""}`}>
      <p aria-label={`${label}: ${displayValue}`} className={`truncate font-semibold text-zinc-950 ${emphasized ? secondaryValue ? "text-lg leading-5" : "mt-0.5 text-lg leading-5" : "text-xs"}`} title={displayValue}>{displayValue}</p>
      {secondaryValue ? <p aria-label={`Эквивалент вашей цены в MDL: ${secondaryValue}`} className="max-w-[52%] shrink-0 truncate text-right text-xs font-medium text-zinc-500" title={secondaryValue}>{secondaryValue}</p> : null}
    </div>
  </div>;
}

function partnerMdlEquivalent(commercialView?: ProductCommercialViewDto): string | null {
  const partnerPrice = commercialView?.partnerPrice;
  if (!partnerPrice || partnerPrice.currencyCode === "MDL") return null;
  if (partnerPrice.currencyCode !== "USD") return null;
  return commercialView?.partnerPriceMdl?.formattedAmount ?? "MDL недоступна";
}
