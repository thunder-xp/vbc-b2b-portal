import type { FreshnessView } from "../../integration/freshness";
import type { ProductCommercialViewDto, ProductPriceViewDto } from "../../pricing-inventory";

export function ProductPricingBlock({ commercialView, freshness, variant = "card" }: { commercialView?: ProductCommercialViewDto; freshness?: FreshnessView | null; variant?: "card" | "detail" }) {
  const showPartnerPrice = Boolean(commercialView?.partnerPrice);
  if (variant === "card") return <div className={`grid min-h-[3.75rem] ${showPartnerPrice ? "grid-cols-2 divide-x" : "grid-cols-1"} divide-zinc-200 rounded-md border border-zinc-200 bg-zinc-50`}>{showPartnerPrice ? <PriceColumn label="ВАША ЦЕНА" value={commercialView?.partnerPrice?.formattedAmount} /> : null}<PriceColumn label="РОЗНИЧНАЯ ЦЕНА" value={commercialView?.retailPrice?.formattedAmount} /></div>;

  return <div className="overflow-hidden border border-zinc-200 bg-white">
    <div className={`grid ${showPartnerPrice ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-1"}`}>
      {showPartnerPrice ? <DetailMetric emphasized label="Ваша цена" price={commercialView?.partnerPriceMdl} secondaryValue={commercialView?.partnerPriceMdl ? formatSecondaryUsd(commercialView?.partnerPrice) : null} value={!commercialView?.partnerPriceMdl ? formatSecondaryUsd(commercialView?.partnerPrice) : null} warning={!commercialView?.partnerPriceMdl && commercialView?.partnerPrice?.currencyCode === "USD" ? "Цена в MDL временно недоступна" : undefined} /> : null}
      <DetailMetric label="Розничная цена" price={commercialView?.retailPrice} secondaryValue={commercialView?.msrpPriceUsd?.formattedAmount} value={!commercialView?.retailPrice ? commercialView?.msrpPriceUsd?.formattedAmount : null} warning={!commercialView?.retailPrice && commercialView?.msrpPriceUsd ? "Цена в MDL временно недоступна" : undefined} />
      {showPartnerPrice ? <DetailMetric label="Валовая прибыль" value={commercialView?.commercialOpportunity?.formattedGrossProfitMdl} /> : null}
      {showPartnerPrice ? <DetailMetric label="Наценка" value={commercialView?.commercialOpportunity?.formattedMarkup} /> : null}
    </div>
    {commercialView?.commercialRateFreshness ? <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500"><p>{commercialView.commercialRateFreshness.label}</p>{commercialView.commercialRateFreshness.staleNotice ? <p className="mt-1 text-amber-700">{commercialView.commercialRateFreshness.staleNotice}</p> : null}</div> : freshness ? <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500"><p>{freshness.label}</p>{freshness.staleNotice ? <p className="mt-1 text-amber-700">{freshness.staleNotice}</p> : null}</div> : null}
  </div>;
}

function DetailMetric({ emphasized = false, label, price, secondaryValue, value, warning }: { emphasized?: boolean; label: string; price?: ProductPriceViewDto | null; secondaryValue?: string | null; value?: string | null; warning?: string }) {
  return <div className={`min-w-0 border-b border-r border-zinc-200 px-4 py-4 ${emphasized ? "bg-emerald-50" : "bg-white"}`}><p className="text-xs font-semibold text-zinc-500">{label}</p><p className={`mt-1 break-words font-semibold text-zinc-950 ${emphasized ? "text-xl" : "text-base"}`}>{price?.formattedAmount ?? value ?? "Цена уточняется"}</p>{secondaryValue ? <p className="mt-1 text-sm font-medium text-zinc-600">{secondaryValue}</p> : null}{warning ? <p className="mt-2 text-xs text-amber-700">{warning}</p> : null}</div>;
}
function formatSecondaryUsd(price?: ProductPriceViewDto | null): string | null { return price?.currencyCode === "USD" && price.formattedAmount ? `${price.formattedAmount} USD` : null; }
function PriceColumn({ label, value }: { label: string; value?: string | null }) { return <div className="flex min-w-0 flex-col justify-center px-2 py-2"><p className="truncate text-[10px] font-semibold text-zinc-500">{label}</p><p className="mt-0.5 truncate text-sm font-semibold text-zinc-950" title={value ?? "Цена уточняется"}>{value ?? "Цена уточняется"}</p></div>; }
