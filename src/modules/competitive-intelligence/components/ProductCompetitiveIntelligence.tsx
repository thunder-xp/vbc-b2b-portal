import { CompetitiveObservationForm } from "./CompetitiveObservationForm";
import { getCompetitiveIntelligenceCopy } from "../copy";
import { formatCompetitiveDifferenceMoney, formatCompetitiveDifferencePercent, formatCompetitiveMoney } from "../service";
import type { PartnerProductCompetitiveIntelligence } from "../types";
import type { PartnerLocale } from "../../partner-locale";

export function ProductCompetitiveIntelligence({ data, locale, productId }: { data: PartnerProductCompetitiveIntelligence; locale: PartnerLocale; productId: string }) {
  const copy = getCompetitiveIntelligenceCopy(locale);
  return (
    <section aria-label={copy.title} className="min-w-0 space-y-5" data-testid="product-competitive-intelligence">
      <header>
        <p className="text-sm leading-6 text-zinc-600">{copy.benefit}</p>
      </header>
      <ComparisonSummary data={data} locale={locale} />
      {data.canManage ? <CompetitiveObservationForm competitors={data.competitors} locale={locale} productId={productId} today={new Date().toISOString().slice(0, 10)} /> : null}
      {data.observations.length ? (
        <>
          <Trend observations={data.observations} title={copy.trend} />
          <section aria-labelledby="competitive-history-title">
            <h2 className="text-base font-semibold text-zinc-950" id="competitive-history-title">{copy.history}</h2>
            <div className="mt-3 overflow-x-auto border border-zinc-200">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs text-zinc-600"><tr><th className="px-3 py-2">{copy.date}</th><th className="px-3 py-2">{copy.competitor}</th><th className="px-3 py-2 text-right">{copy.competitorPrice}</th><th className="px-3 py-2 text-right">{copy.novotechPrice}</th><th className="px-3 py-2 text-right">{copy.difference}</th><th className="px-3 py-2 text-right">{copy.quantity}</th><th className="px-3 py-2">{copy.source}</th></tr></thead>
                <tbody className="divide-y divide-zinc-100">{data.observations.map((item) => <tr className={item.isSuperseded ? "text-zinc-400" : "text-zinc-800"} key={item.id}><td className="px-3 py-3">{formatDate(item.date, locale)}</td><td className="px-3 py-3 font-medium">{item.competitorName}</td><td className="px-3 py-3 text-right tabular-nums">{formatCompetitiveMoney(item.price, item.currency, locale)}</td><td className="px-3 py-3 text-right tabular-nums">{formatCompetitiveMoney(item.novotechPrice, item.novotechCurrency, locale)}</td><td className="px-3 py-3 text-right tabular-nums">{formatCompetitiveDifferenceMoney(item.deltaAmount, item.novotechCurrency, locale)}<span className="block text-xs text-zinc-500">{formatCompetitiveDifferencePercent(item.deltaPercent, locale)}</span></td><td className="px-3 py-3 text-right tabular-nums">{item.quantity}</td><td className="px-3 py-3">{copy.sourceLabels[item.sourceType]}{item.evidenceId ? <a className="block text-xs font-medium text-emerald-800 underline-offset-2 hover:underline" href={`/api/competitive-intelligence/evidence/${item.evidenceId}`}>{copy.evidence}</a> : null}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </>
      ) : <div className="py-5 text-center"><p className="text-sm text-zinc-600">{copy.noHistory}</p></div>}
    </section>
  );
}

function ComparisonSummary({ data, locale }: { data: PartnerProductCompetitiveIntelligence; locale: PartnerLocale }) {
  const copy = getCompetitiveIntelligenceCopy(locale);
  if (!data.summary.observationCount) return null;
  return <section aria-label={copy.currentSummary} className="grid gap-3 border-y border-zinc-200 py-4 sm:grid-cols-3"><Metric label={copy.competitorPrice} value={formatCompetitiveMoney(data.summary.latestCompetitorPrice, data.summary.latestCurrency, locale)} /><Metric label={copy.novotechPrice} value={formatCompetitiveMoney(data.summary.latestNovotechPrice, data.summary.latestNovotechCurrency, locale)} /><Metric label={copy.difference} value={`${formatCompetitiveDifferenceMoney(data.summary.latestDeltaAmount, data.summary.latestCurrency, locale)} · ${formatCompetitiveDifferencePercent(data.summary.latestDeltaPercent, locale)}`} /></section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-zinc-950">{value}</dd></div>; }

function Trend({ observations, title }: { observations: PartnerProductCompetitiveIntelligence["observations"]; title: string }) {
  const points = observations.filter((item) => !item.isSuperseded).slice(0, 20).reverse();
  if (points.length < 2) return null;
  const values = points.flatMap((item) => [item.price, ...(item.novotechPrice === null ? [] : [item.novotechPrice])]);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, 1);
  const competitor = points.map((item, index) => `${x(index, points.length)},${y(item.price, min, span)}`).join(" ");
  const novotech = points.flatMap((item, index) => item.novotechPrice === null ? [] : [`${x(index, points.length)},${y(item.novotechPrice, min, span)}`]).join(" ");
  return <section aria-labelledby="competitive-trend-title"><h2 className="text-base font-semibold text-zinc-950" id="competitive-trend-title">{title}</h2><svg aria-label={title} className="mt-3 h-40 w-full border-y border-zinc-200 bg-zinc-50" preserveAspectRatio="none" role="img" viewBox="0 0 100 100"><polyline fill="none" points={competitor} stroke="#18181b" strokeWidth="2" vectorEffect="non-scaling-stroke" />{novotech ? <polyline fill="none" points={novotech} stroke="#059669" strokeDasharray="4 3" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}</svg></section>;
}
function x(index: number, count: number) { return count === 1 ? 50 : (index / (count - 1)) * 100; }
function y(value: number, min: number, span: number) { return 90 - ((value - min) / span) * 80; }
function formatDate(value: string, locale: PartnerLocale) { return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
