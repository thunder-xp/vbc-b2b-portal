import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { getBehaviorAnalyticsPreviewAction } from "@/src/modules/behavior-analytics/actions";

export default async function AdminCommercialAnalyticsPage() {
  await requireAdminPagePermission("admin.analytics.view");
  const preview = await getBehaviorAnalyticsPreviewAction();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Агрегированные сигналы интереса партнёров за последние 30 дней. Без персонального наблюдения и коммерческих значений."
        eyebrow="Коммерческие данные"
        title="Предварительная аналитика"
      />
      {!preview.sufficientVolume ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Данных пока недостаточно для выводов. Показаны только накопленные агрегаты.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Событий" value={preview.eventCount} />
        <Metric label="Товаров с интересом" value={preview.products.length} />
        <Metric label="Поисков без результата" value={preview.searchGaps.reduce((sum, item) => sum + item.searches, 0)} />
        <Metric label="Период, дней" value={preview.periodDays} />
      </div>
      <AnalyticsTable
        columns={["Товар", "Просмотры", "В корзину", "В сметы", "Без остатка"]}
        empty="Интерес к товарам пока не зафиксирован."
        rows={preview.products.map((item) => [
          `${item.sku} · ${item.name}`,
          item.views,
          item.cart_adds,
          item.estimate_adds,
          item.no_stock_views,
        ])}
        title="Интерес к товарам"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <AnalyticsTable
          columns={["Запрос", "Поиски", "Компании"]}
          empty="Поисков без результата пока нет."
          rows={preview.searchGaps.map((item) => [
            item.query,
            item.searches,
            item.company_count,
          ])}
          title="Разрывы спроса"
        />
        <AnalyticsTable
          columns={["Подборка", "Просмотры", "Переходы"]}
          empty="Взаимодействий с подборками пока нет."
          rows={preview.merchandising.map((item) => [
            merchandisingName(item.surface),
            item.views,
            item.clicks,
          ])}
          title="Подборки каталога"
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-zinc-200 bg-white p-4"><p className="text-xs font-medium text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p></div>;
}

function AnalyticsTable({ columns, empty, rows, title }: { columns: string[]; empty: string; rows: Array<Array<string | number>>; title: string }) {
  return <section><h2 className="mb-3 text-base font-semibold text-zinc-950">{title}</h2><div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">{rows.length ? <table className="min-w-full text-sm"><thead className="bg-zinc-50 text-left text-xs text-zinc-500"><tr>{columns.map((column) => <th className="px-3 py-2 font-medium" key={column}>{column}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100">{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, index) => <td className="px-3 py-2 text-zinc-700" key={`${rowIndex}:${index}`}>{value}</td>)}</tr>)}</tbody></table> : <p className="p-4 text-sm text-zinc-500">{empty}</p>}</div></section>;
}

function merchandisingName(value: string | null): string {
  if (value === "TOP") return "Популярные";
  if (value === "NEW") return "Новинки";
  if (value === "HOT") return "Горячие предложения";
  return "Не указана";
}
