import type { CompanyCompetitiveIntelligenceData as CompanyView } from "../types";

export function CompanyCompetitiveIntelligence({ data }: { data: CompanyView | null }) {
  if (!data) return null;
  return <section aria-labelledby="company-competition-title" className="space-y-3">
    <div><h2 id="company-competition-title" className="text-base font-semibold text-zinc-950">Ценовая конкуренция</h2>
      <p className="mt-1 text-sm text-zinc-600">Внутренняя оценка товаров, где подтверждённая внешняя цена ниже цены Novotech.</p></div>
    <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="min-w-[820px] w-full text-sm">
      <thead className="bg-zinc-50 text-left text-xs text-zinc-600"><tr><th className="px-3 py-2">SKU / товар</th><th className="px-3 py-2">Источник</th><th className="px-3 py-2">Novotech</th><th className="px-3 py-2">Конкурент</th><th className="px-3 py-2">Разрыв</th><th className="px-3 py-2">Покупки 90 дн.</th><th className="px-3 py-2">Последний заказ</th><th className="px-3 py-2">Уверенность</th></tr></thead>
      <tbody className="divide-y divide-zinc-100">{data.items.map((row) => <tr key={row.sku}>
        <td className="px-3 py-3"><span className="font-semibold">{row.sku}</span><span className="ml-2 text-zinc-600">{row.productName}</span></td><td className="px-3 py-3">{row.sourceName ?? "—"}</td>
        <td className="px-3 py-3 tabular-nums">{money(row.novotechPrice, row.currency)}</td><td className="px-3 py-3 tabular-nums">{money(row.competitorPrice, row.currency)}</td>
        <td className="px-3 py-3 tabular-nums">{row.gapPct === null ? "—" : `${row.gapPct.toFixed(1)}%`}</td><td className="px-3 py-3 tabular-nums">{row.purchases90d}</td>
        <td className="px-3 py-3">{row.lastPurchaseAt ? new Intl.DateTimeFormat("ru-RU").format(new Date(row.lastPurchaseAt)) : "—"}</td><td className="px-3 py-3">{row.confidence === "high" ? "Высокая" : row.confidence === "medium" ? "Средняя" : "Низкая"}</td>
      </tr>)}{data.items.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-500">Для компании нет сопоставимых товаров под ценовым давлением.</td></tr>}</tbody>
    </table></div>
  </section>;
}

function money(value: number | null, currency: string | null) { return value === null ? "—" : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ${currency ?? ""}`.trim(); }
