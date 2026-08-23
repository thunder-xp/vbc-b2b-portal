import type { CompetitiveIntelligenceDashboard } from "../types";

export function CompetitiveIntelligenceTables({ data }: { data: CompetitiveIntelligenceDashboard }) {
  return (
    <div className="space-y-7">
      <section aria-labelledby="price-pressure-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="price-pressure-title" className="text-base font-semibold text-zinc-950">Товары под ценовым давлением</h2>
            <p className="mt-1 text-sm text-zinc-600">Только сопоставимые валюты; уверенность ограничена числом независимых компаний.</p>
          </div>
          <p className="text-sm text-zinc-600">{data.counts.productsUnderPressure} товаров · {data.counts.lowConfidenceProducts} с низкой уверенностью</p>
        </div>
        <div className="mt-3 overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-[1120px] w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-600"><tr>
              <th className="px-3 py-2">SKU / модель</th><th className="px-3 py-2">Источник</th>
              <th className="px-3 py-2 text-right">Novotech</th><th className="px-3 py-2 text-right">Медиана / лучшая</th>
              <th className="px-3 py-2 text-right">Разница</th><th className="px-3 py-2">Компании</th>
              <th className="px-3 py-2">Свежесть</th><th className="px-3 py-2">Уверенность</th>
              <th className="px-3 py-2">Охват</th><th className="px-3 py-2">Приоритет</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {data.products.map((row) => <tr key={row.productId}>
                <td className="px-3 py-3"><span className="block font-semibold text-zinc-950">{row.sku}</span><span className="block max-w-64 text-xs text-zinc-600">{row.productName}</span></td>
                <td className="px-3 py-3">{row.sourceName ?? "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(row.novotechPrice, row.novotechCurrency)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(row.competitorMedianPrice, row.competitorCurrency)} / {money(row.competitorBestPrice, row.competitorCurrency)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(row.gapAmount, row.novotechCurrency)}<span className="block text-xs text-zinc-500">{percent(row.gapPct)}</span></td>
                <td className="px-3 py-3 tabular-nums">{row.contributingPartnerCount}</td>
                <td className="px-3 py-3">{days(row.freshnessDays)}</td><td className="px-3 py-3">{confidence(row.confidence)}</td>
                <td className="px-3 py-3 tabular-nums">{row.partnerExposureCount}</td><td className="px-3 py-3 tabular-nums">{row.priority}</td>
              </tr>)}
              {data.products.length === 0 && <tr><td className="px-3 py-8 text-center text-zinc-500" colSpan={10}>Сопоставимых товаров под давлением нет.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="partner-exposure-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="partner-exposure-title" className="text-base font-semibold text-zinc-950">Конкурентная экспозиция партнёров</h2>
            <p className="mt-1 text-sm text-zinc-600">Оценка использует фактические покупки и интерес без раскрытия данных других партнёров.</p></div>
          <p className="text-sm text-zinc-600">{data.counts.partnersExposed} партнёров</p>
        </div>
        <div className="mt-3 overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-600"><tr>
              <th className="px-3 py-2">Партнёр</th><th className="px-3 py-2">Товары</th><th className="px-3 py-2">Средний разрыв</th>
              <th className="px-3 py-2">Покупки затронуты</th><th className="px-3 py-2">Экспозиция</th>
              <th className="px-3 py-2">Свежесть</th><th className="px-3 py-2">Внимание</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {data.partners.map((row) => <tr key={row.companyId}>
                <td className="px-3 py-3 font-semibold text-zinc-950">{row.partnerName}</td><td className="px-3 py-3 tabular-nums">{row.productsUnderPressure}</td>
                <td className="px-3 py-3 tabular-nums">{percent(row.averageWeightedGap)}</td><td className="px-3 py-3 tabular-nums">{row.recentPurchasesAffected}</td>
                <td className="px-3 py-3 tabular-nums">{money(row.estimatedExposedRevenue, row.currency)}</td><td className="px-3 py-3">{days(row.freshnessDays)}</td>
                <td className="px-3 py-3">{attention(row.attentionLevel)}</td>
              </tr>)}
              {data.partners.length === 0 && <tr><td className="px-3 py-8 text-center text-zinc-500" colSpan={7}>Партнёрская экспозиция не выявлена.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function money(value: number | null, currency: string | null) { return value === null ? "—" : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ${currency ?? ""}`.trim(); }
function percent(value: number | null) { return value === null ? "—" : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`; }
function days(value: number | null) { return value === null ? "—" : value === 0 ? "сегодня" : `${value} дн.`; }
function confidence(value: "low" | "medium" | "high") { return value === "high" ? "Высокая" : value === "medium" ? "Средняя" : "Низкая"; }
function attention(value: "low" | "medium" | "high") { return value === "high" ? "Высокое" : value === "medium" ? "Среднее" : "Наблюдение"; }
