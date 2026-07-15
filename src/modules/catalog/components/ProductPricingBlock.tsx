import type { FreshnessView } from "../../integration/freshness";
import type { ProductCommercialViewDto, ProductPriceViewDto } from "../../pricing-inventory";

export function ProductPricingBlock({ commercialView, freshness, variant = "card" }: { commercialView?: ProductCommercialViewDto; freshness?: FreshnessView | null; variant?: "card" | "detail" }) {
  if (variant === "card") return <div className="grid grid-cols-2 divide-x divide-zinc-200 rounded-md border border-zinc-200 bg-zinc-50"><PriceColumn label="ОПТОВАЯ" value={commercialView?.partnerPrice?.formattedAmount} /><PriceColumn label="РОЗНИЧНАЯ" value={commercialView?.retailPrice?.formattedAmount} /></div>;

  return <div className="overflow-hidden border border-zinc-200 bg-white">
    <div className="grid sm:grid-cols-2 xl:grid-cols-4">
      <DetailMetric emphasized label="Партнёрская цена" price={commercialView?.partnerPrice} />
      <DetailMetric label="Розничная цена" price={commercialView?.retailPrice} />
      <DetailMetric label="Валовая прибыль" value={commercialView?.commercialOpportunity?.formattedGrossProfit} />
      <DetailMetric label="Наценка" value={commercialView?.commercialOpportunity?.formattedMarkup} />
    </div>
    {freshness ? <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500"><p>{freshness.label}</p>{freshness.staleNotice ? <p className="mt-1 text-amber-700">{freshness.staleNotice}</p> : null}</div> : null}
  </div>;
}

function DetailMetric({ emphasized = false, label, price, value }: { emphasized?: boolean; label: string; price?: ProductPriceViewDto | null; value?: string | null }) {
  return <div className={`min-w-0 border-b border-r border-zinc-200 px-4 py-4 ${emphasized ? "bg-emerald-50" : "bg-white"}`}><p className="text-xs font-semibold text-zinc-500">{label}</p><p className={`mt-1 break-words font-semibold text-zinc-950 ${emphasized ? "text-xl" : "text-base"}`}>{price?.formattedAmount ?? value ?? "Цена уточняется"}</p>{price?.currencyCode ? <p className="mt-1 text-xs text-zinc-500">Валюта: {price.currencyCode}</p> : null}</div>;
}
function PriceColumn({ label, value }: { label: string; value?: string | null }) { return <div className="min-w-0 px-3 py-2.5"><p className="text-xs font-semibold text-zinc-500">{label}</p><p className="mt-1 break-words text-base font-semibold text-zinc-950">{value ?? "Цена уточняется"}</p></div>; }
