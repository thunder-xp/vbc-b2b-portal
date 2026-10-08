import { formatPartnerMoney, type PartnerLocale } from "@/src/modules/partner-locale";
import type { CampaignCommercialSummary as Summary } from "../types";

/** Display only: every value is supplied by the campaign service projection. */
export function CampaignCommercialSummary({ summary, locale }: { summary: Summary; locale: PartnerLocale }) {
  const ro = locale === "ro";
  const money = (value: string, currency = summary.currency as string) => formatPartnerMoney(Number(value), currency, locale);
  return <dl className="grid min-w-0 gap-2 tabular-nums" data-testid="campaign-commercial-summary">
    {summary.normalPartnerTotal !== null ? <div><dt className="text-xs text-zinc-600">{ro ? "Prețul dvs." : "Ваша цена"}</dt><dd className="text-sm text-zinc-600 line-through">{money(summary.normalPartnerTotal)}</dd></div> : null}
    <div><dt className="text-xs text-zinc-600">{ro ? "Preț special" : "Спеццена"}</dt><dd className="break-words text-xl font-bold text-emerald-800">{money(summary.specialBundleTotal)}</dd></div>
    {summary.saving !== null ? <div><dt className="text-xs text-zinc-600">{ro ? "Economisire" : "Экономия"}</dt><dd className="text-sm font-semibold">{money(summary.saving)}</dd></div> : null}
    {summary.retailTotal !== null ? <div><dt className="text-xs text-zinc-600">{ro ? "Preț retail" : "Розничная цена"}</dt><dd className="text-sm">{money(summary.retailTotal, "MDL")}</dd></div> : null}
    {summary.markupFromRetail !== null ? <div><dt className="text-xs text-zinc-600">{ro ? "Adaos față de retail" : "Наценка от розницы"}</dt><dd className="text-sm font-semibold">{summary.markupFromRetail}</dd></div> : null}
  </dl>;
}
