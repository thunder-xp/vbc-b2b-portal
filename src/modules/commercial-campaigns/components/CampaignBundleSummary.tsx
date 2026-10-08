import { ProductThumbnail } from "@/src/modules/catalog/components/ProductThumbnail";
import { formatPartnerDate, type PartnerLocale } from "@/src/modules/partner-locale";
import type { PartnerCampaign } from "../types";
import { CampaignBundleProgress } from "./CampaignBundleProgress";
import { CampaignCommercialSummary } from "./CampaignCommercialSummary";

export function CampaignBundleSummary({ campaign, locale }: { campaign: PartnerCampaign; locale: PartnerLocale }) {
  if (campaign.mechanicType !== "bundle_special_price") return null;
  return <section className="grid min-w-0 gap-4 rounded-md border border-zinc-200 bg-white p-4 xl:grid-cols-3" aria-label={locale === "ro" ? "Set la preț special" : "Набор по спеццене"}>
    <div className="min-w-0"><h2 className="font-semibold">{campaign.title}</h2><ul className="mt-3 grid gap-3">
      {campaign.products.map(p => <li className="flex min-w-0 items-center gap-2" key={p.itemId}><div className="relative size-12 shrink-0"><ProductThumbnail alt="" src={p.imageUrl} sizes="48px" variant="sm" /></div><div className="min-w-0 text-xs"><p className="break-words font-medium">{p.name}</p><p className="text-zinc-600">SKU {p.sku} · {p.requiredBundleQuantity} {locale === "ro" ? "buc." : "шт."}</p></div></li>)}
    </ul></div>
    <div className="min-w-0">{campaign.commercialSummary ? <CampaignCommercialSummary summary={campaign.commercialSummary} locale={locale} /> : <p className="text-xs text-zinc-600">{locale === "ro" ? "Condițiile comerciale se verifică" : "Коммерческие условия уточняются"}</p>}</div>
    <div className="min-w-0"><p className="text-xs text-zinc-600">{formatPartnerDate(campaign.startsAt, locale)} — {formatPartnerDate(campaign.endsAt, locale)}</p><p className="mt-2 break-words text-sm">{campaign.termsSummary}</p>{campaign.bundleProgress ? <CampaignBundleProgress progress={campaign.bundleProgress} mechanicType="bundle_special_price" locale={locale} /> : null}</div>
  </section>;
}
