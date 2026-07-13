import type { ProductCommercialViewDto } from "../../pricing-inventory";

export function ProductPricingBlock({ commercialView, variant = "card" }: { commercialView?: ProductCommercialViewDto; variant?: "card" | "detail" }) {
  if (variant === "card") {
    return <div className="grid grid-cols-2 divide-x divide-zinc-200 rounded-md border border-zinc-200 bg-zinc-50">
      <PriceColumn label="ОПТОВАЯ" value={commercialView?.partnerPrice?.formattedAmount} />
      <PriceColumn label="РОЗНИЧНАЯ" value={commercialView?.retailPrice?.formattedAmount} />
    </div>;
  }

  return <div className="grid grid-cols-2 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
    <PriceColumn bordered label="Розница" value={commercialView?.retailPrice?.formattedAmount} />
    <PriceColumn bordered label="Партнёрская" value={commercialView?.partnerPrice?.formattedAmount} />
    {commercialView?.commercialOpportunity ? <>
      <PriceColumn bordered label="Валовая прибыль" value={commercialView.commercialOpportunity.formattedGrossProfit} />
      <PriceColumn bordered label="Наценка" value={commercialView.commercialOpportunity.formattedMarkup} />
    </> : null}
  </div>;
}

function PriceColumn({ bordered = false, label, value }: { bordered?: boolean; label: string; value?: string | null }) {
  return <div className={`min-w-0 px-3 py-2.5 ${bordered ? "border-b border-r border-zinc-200" : ""}`}><p className="text-xs font-semibold text-zinc-500">{label}</p><p className="mt-1 break-words text-base font-semibold text-zinc-950">{value ?? "Цена уточняется"}</p></div>;
}
