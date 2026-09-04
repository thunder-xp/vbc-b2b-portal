import type { AdminGovernedPriceCoverage as Coverage } from "../types";

export function AdminGovernedPriceCoverageView({ coverage }: { coverage: Coverage }) {
  const metrics = [
    ["Активные корзины", coverage.summary.activeCarts],
    ["Непустые корзины", coverage.summary.nonEmptyActiveCarts],
    ["Строки с ценой", coverage.summary.linesWithGovernedPrice],
    ["Строки без цены", coverage.summary.missingGovernedPriceLines],
    ["Заблокированные корзины", coverage.summary.activeCartsBlocked],
  ] as const;

  return (
    <section className="space-y-4 border-t border-zinc-200 pt-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">Покрытие партнёрских цен</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Проверка активных корзин по назначенному типу цены. Теоретические сочетания товаров и типов цен не считаются ошибками без реального коммерческого контекста.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <article className="border border-zinc-200 bg-white p-4" key={label}>
            <p className="text-xs uppercase text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
          </article>
        ))}
      </div>

      <p className="text-sm text-zinc-600">
        Активных товаров: {coverage.catalogCoverage.publishedActiveProducts}. Используемых типов партнёрских цен: {coverage.catalogCoverage.currentlyUsedPartnerPriceTypes}. Значимых сочетаний в покупательском контексте: {coverage.catalogCoverage.meaningfulBuyingContextPairs}; без цены: {coverage.catalogCoverage.meaningfulMissingPairs}.
      </p>

      {coverage.issues.length ? (
        <div className="overflow-hidden border border-amber-300 bg-white">
          <h3 className="border-b border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-zinc-950">
            Требуется действие в 1С
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  {["Приоритет", "Компания", "SKU", "Товар", "Тип цены", "Действие"].map((header) => (
                    <th className="px-4 py-3" key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {coverage.issues.map((issue) => (
                  <tr key={`${issue.companyId}-${issue.productId}`}>
                    <td className="px-4 py-3">{issue.severity === "high" ? "Высокий" : "Средний"}</td>
                    <td className="px-4 py-3">{issue.companyName}</td>
                    <td className="px-4 py-3">{issue.sku}</td>
                    <td className="px-4 py-3">{issue.productName}</td>
                    <td className="px-4 py-3">{issue.governedPriceType}</td>
                    <td className="px-4 py-3">Создайте или восстановите назначенную цену в 1С, затем запустите штатную синхронизацию цен.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Все активные корзины имеют разрешимую назначенную цену.
        </p>
      )}
    </section>
  );
}
