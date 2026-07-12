import type { ProductCommercialViewDto } from "../../pricing-inventory";

export function ProductPricingBlock({ commercialView }: { commercialView?: ProductCommercialViewDto }) {
  return <div className="grid grid-cols-2 divide-x divide-zinc-200 rounded-md border border-zinc-200 bg-zinc-50">
    <PriceColumn label="ОПТОВАЯ" value={commercialView?.partnerPrice?.formattedAmount} />
    <PriceColumn label="РОЗНИЧНАЯ" value={commercialView?.retailPrice?.formattedAmount} />
  </div>;
}

function PriceColumn({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0 px-3 py-2.5"><p className="text-xs font-semibold text-zinc-500">{label}</p><p className="mt-1 break-words text-base font-semibold text-zinc-950">{value ?? "Цена уточняется"}</p></div>;
}
