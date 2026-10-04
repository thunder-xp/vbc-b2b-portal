import { formatPartnerMoney, secondaryCopy, type PartnerLocale } from "@/src/modules/partner-locale";

import type { CampaignProduct } from "../types";

export function CampaignPriceStack({ product, locale }: { product: Pick<CampaignProduct, "msrpPrice" | "partnerPrice" | "specialPrice" | "mechanicType" | "promoThresholdQuantity">; locale: PartnerLocale }) {
  const copy = secondaryCopy(locale);
  const rows = [
    { label: copy.msrp, price: product.msrpPrice, className: "text-xs text-zinc-500", valueClassName: "line-through decoration-zinc-400" },
    { label: copy.yourPrice, price: product.partnerPrice, className: "text-sm text-zinc-700", valueClassName: "font-semibold text-zinc-950" },
    { label: product.mechanicType === "fixed_bundle_promo" ? locale === "ro" ? "PROMO pentru setul complet" : "PROMO при полном комплекте" : product.mechanicType === "quantity_threshold_promo" && product.promoThresholdQuantity ? locale === "ro" ? `De la ${product.promoThresholdQuantity} buc. · PROMO` : `От ${product.promoThresholdQuantity} шт. · PROMO` : copy.specialPrice, price: product.specialPrice, className: "text-sm font-semibold text-emerald-800", valueClassName: "text-lg font-bold" },
  ].filter((row) => row.price);

  if (!rows.length) return <p className="mt-3 text-sm font-medium text-zinc-600">{copy.pricePending}</p>;

  return <dl className="mt-3 grid gap-1.5" data-testid="campaign-price-stack">
    {rows.map((row) => <div className={`flex items-baseline justify-between gap-3 ${row.className}`} key={row.label}>
      <dt>{row.label}</dt>
      <dd className={row.valueClassName}>{formatPartnerMoney(row.price!.amount, "USD", locale)}</dd>
    </div>)}
  </dl>;
}
