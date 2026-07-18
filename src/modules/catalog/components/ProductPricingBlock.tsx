import type { FreshnessView } from "../../integration/freshness";
import type { ProductCommercialViewDto, ProductPriceViewDto } from "../../pricing-inventory";

export function ProductPricingBlock({ commercialView, freshness, variant = "card" }: { commercialView?: ProductCommercialViewDto; freshness?: FreshnessView | null; variant?: "card" | "detail" }) {
  if (variant === "card") return <div className="grid grid-cols-2 divide-x divide-zinc-200 rounded-md border border-zinc-200 bg-zinc-50"><PriceColumn label="ПАРТНЁРСКАЯ" value={commercialView?.partnerPrice?.formattedAmount} /><PriceColumn label="РОЗНИЧНАЯ" value={commercialView?.retailPrice?.formattedAmount} /></div>;

  return <div className="overflow-hidden border border-zinc-200 bg-white">
    <div className="grid sm:grid-cols-2 xl:grid-cols-4">
      <DetailMetric emphasized label="Партнёрская цена" price={commercialView?.partnerPriceMdl} secondaryValue={commercialView?.partnerPriceMdl ? formatSecondaryUsd(commercialView?.partnerPrice) : null} value={!commercialView?.partnerPriceMdl ? formatSecondaryUsd(commercialView?.partnerPrice) : null} warning={!commercialView?.partnerPriceMdl && commercialView?.partnerPrice?.currencyCode === "USD" ? "Цена в MDL временно недоступна" : undefined} />
      <DetailMetric label="Розничная цена" price={commercialView?.retailPrice} secondaryValue={commercialView?.retailPriceUsd?.formattedAmount} warning={!commercialView?.retailPriceUsd && commercialView?.retailPrice?.currencyCode === "MDL" ? "Цена в USD временно недоступна" : undefined} />
      <DetailMetric label="Валовая прибыль" value={commercialView?.commercialOpportunity?.formattedGrossProfitMdl} />
      <DetailMetric label="Наценка" value={commercialView?.commercialOpportunity?.formattedMarkup} />
    </div>
    {commercialView?.commercialRateFreshness ? <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500"><p>{commercialView.commercialRateFreshness.label}</p>{commercialView.commercialRateFreshness.staleNotice ? <p className="mt-1 text-amber-700">{commercialView.commercialRateFreshness.staleNotice}</p> : null}</div> : freshness ? <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500"><p>{freshness.label}</p>{freshness.staleNotice ? <p className="mt-1 text-amber-700">{freshness.staleNotice}</p> : null}</div> : null}
  </div>;
}

function DetailMetric({ emphasized = false, label, price, secondaryValue, value, warning }: { emphasized?: boolean; label: string; price?: ProductPriceViewDto | null; secondaryValue?: string | null; value?: string | null; warning?: string }) {
  return <div className={`min-w-0 border-b border-r border-zinc-200 px-4 py-4 ${emphasized ? "bg-emerald-50" : "bg-white"}`}><p className="text-xs font-semibold text-zinc-500">{label}</p><p className={`mt-1 break-words font-semibold text-zinc-950 ${emphasized ? "text-xl" : "text-base"}`}>{price?.formattedAmount ?? value ?? "Цена уточняется"}</p>{secondaryValue ? <p className="mt-1 text-sm font-medium text-zinc-600">{secondaryValue}</p> : null}{warning ? <p className="mt-2 text-xs text-amber-700">{warning}</p> : null}</div>;
}
function formatSecondaryUsd(price?: ProductPriceViewDto | null): string | null { return price?.currencyCode === "USD" && price.formattedAmount ? `${price.formattedAmount} USD` : null; }
function PriceColumn({ label, value }: { label: string; value?: string | null }) { return <div className="min-w-0 px-3 py-2.5"><p className="text-xs font-semibold text-zinc-500">{label}</p><p className="mt-1 break-words text-base font-semibold text-zinc-950">{value ?? "Цена уточняется"}</p></div>; }
