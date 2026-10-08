import {
  formatPartnerMoney,
  type PartnerLocale,
} from "@/src/modules/partner-locale";
import type { CampaignCommercialSummary as Summary } from "../types";

/** Display only: every value is supplied by the campaign service projection. */
export function CampaignCommercialSummary({
  summary,
  locale,
  specialLabel,
  normalLabel,
}: {
  summary: Summary;
  locale: PartnerLocale;
  specialLabel?: string;
  normalLabel?: string;
}) {
  const ro = locale === "ro";
  const money = (value: string, currency = summary.currency as string) =>
    formatPartnerMoney(Number(value), currency, locale);
  const percent = (value: number) =>
    `${new Intl.NumberFormat(ro ? "ro-MD" : "ru-MD", { maximumFractionDigits: 1 }).format(value)}%`;
  return (
    <dl
      className="grid min-w-0 gap-2 tabular-nums"
      data-testid="campaign-commercial-summary"
    >
      {summary.retailTotal !== null ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] text-zinc-600">
          <dt>{ro ? "Retail" : "Розница"}</dt>
          <dd>{money(summary.retailTotal, "MDL")}</dd>
        </div>
      ) : null}
      {summary.normalPartnerTotal !== null ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] text-zinc-600">
          <dt>{normalLabel ?? (ro ? "Prețul obișnuit" : "Обычная цена партнёра")}</dt>
          <dd className="line-through">{money(summary.normalPartnerTotal)}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-[11px] font-medium text-zinc-600">
          {specialLabel ?? (ro ? "Preț special" : "Спеццена")}
        </dt>
        <dd
          className="break-words text-xl font-bold leading-tight text-emerald-800"
          data-special-price
        >
          {money(summary.specialBundleTotal)}
        </dd>
      </div>
      {summary.saving !== null ? (
        <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-medium text-emerald-800">
          <dt>{ro ? "Economisire" : "Экономия"}</dt>
          <dd>
            {money(summary.saving)}
            {summary.savingPercent != null
              ? ` · ${percent(summary.savingPercent)}`
              : ""}
          </dd>
        </div>
      ) : null}
      {summary.markupFromRetail !== null ? (
        <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-zinc-700">
          <dt>{ro ? "Adaos față de retail" : "Наценка от розницы"}</dt>
          <dd className="font-semibold">
            {summary.markupPercent != null
              ? percent(summary.markupPercent)
              : summary.markupFromRetail}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
