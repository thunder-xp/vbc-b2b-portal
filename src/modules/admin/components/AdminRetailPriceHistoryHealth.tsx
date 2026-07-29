import type { AdminRetailPriceHistoryHealth as Health } from "../types";

export function AdminRetailPriceHistoryHealthView({ health }: { health: Health }) {
  const verification = health.verification;
  const blocked = verification.status !== "verified";
  return (
    <section aria-labelledby="retail-history-health" className="border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950" id="retail-history-health">Проверка валюты истории RETAIL</h2>
          <p className="mt-1 text-sm text-zinc-600">Источник: {verification.source_entity}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${blocked ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          {blocked ? "Публикация истории заблокирована" : "Валюта подтверждена"}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Текущая валюта" value={verification.current_currency} />
        <Metric label="Текущие RETAIL цены" value={health.productsWithCurrentRetail} />
        <Metric label="Товары с историей" value={health.productsWithHistory} />
        <Metric label="Только baseline" value={health.productsWithBaselineOnly} />
        <Metric label="Найдено исторических строк" value={verification.historical_rows_discovered} />
        <Metric label="Товаров в источнике" value={verification.distinct_products} />
        <Metric label="Ошибки добавления" value={health.failedHistoryAppendCount} />
        <Metric label="Последнее обновление" value={verification.latest_effective_at ? formatDate(verification.latest_effective_at) : "Нет данных"} />
      </dl>
      {blocked ? <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Не подтверждена валюта исторических записей RETAIL. Для разблокировки требуется проверяемое доказательство и защищённая операция с аудитом.</p> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-md bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-zinc-950">{value}</dd></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
