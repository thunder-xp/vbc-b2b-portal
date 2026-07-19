import Link from "next/link";

import { listPartnerOrderHistoryAction } from "@/src/modules/orders/actions";
import { OrderHistoryRefreshButton } from "@/src/modules/orders/components/OrderHistoryRefreshButton";

const FILTERS = [
  ["all", "Все"],
  ["processing", "Обрабатывается"],
  ["open", "Открыт"],
  ["preorder", "Предзаказ"],
  ["test", "Тест"],
  ["completed", "Завершен"],
] as const;

type OrdersPageProps = {
  searchParams: Promise<{ status?: string | string[]; query?: string | string[]; page?: string | string[] }>;
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const status = scalar(params.status);
  const query = scalar(params.query);
  const page = scalar(params.page);
  const result = await listPartnerOrderHistoryAction({ filter: status, search: query, page });
  if (!result.success) {
    return <p className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Не удалось загрузить заказы. Повторите попытку позже.</p>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">Коммерческие документы</p>
          <h1 className="mt-1 text-2xl font-semibold">Заказы</h1>
          <p className="mt-2 text-sm text-zinc-600">Актуальная история заказов вашей компании из 1С.</p>
          <p className="mt-1 text-xs text-zinc-500">{result.data.freshness.label}</p>
          {result.data.freshness.staleNotice ? <p className="mt-1 text-xs text-amber-700">{result.data.freshness.staleNotice}</p> : null}
        </div>
        <OrderHistoryRefreshButton />
      </header>

      <div className="space-y-3 border-y border-zinc-200 py-4">
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Состояние заказа">
          {FILTERS.map(([value, label]) => (
            <Link
              className={result.data.filter === value
                ? "whitespace-nowrap rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"
                : "whitespace-nowrap rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"}
              href={filterHref(value, result.data.search)}
              key={value}
              prefetch={false}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="flex max-w-lg gap-2" method="get">
          <input name="status" type="hidden" value={result.data.filter} />
          <input
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            defaultValue={result.data.search}
            name="query"
            placeholder="Поиск по номеру проведённого заказа"
            type="search"
          />
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800" type="submit">Найти</button>
        </form>
      </div>

      {result.data.orders.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center">
          <h2 className="font-semibold">Заказы не найдены</h2>
          <p className="mt-2 text-sm text-zinc-600">Обновите историю из 1С или измените параметры поиска.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="hidden grid-cols-[minmax(190px,1fr)_110px_130px_140px_110px_110px_120px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500 xl:grid">
            <span>Заказ</span><span>Дата</span><span>Состояние</span><span>Сумма</span><span>Планируемая отгрузка</span><span>Состав</span><span>Обновлено</span>
          </div>
          <ul className="divide-y divide-zinc-200">
            {result.data.orders.map((order) => (
              <li className="relative" key={order.id}>
                <Link className="grid gap-2 p-4 pr-36 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 xl:grid-cols-[minmax(190px,1fr)_110px_130px_140px_110px_110px_120px] xl:items-center" href={`/cabinet/orders/${order.id}`} prefetch={false}>
                  <span className="font-semibold text-zinc-950">{order.primaryLabel}</span>
                  <span className="text-sm text-zinc-600">{formatDate(order.documentDate)}</span>
                  <span className="text-sm font-medium text-zinc-700">{order.statusLabel}</span>
                  <span className="text-sm font-semibold text-zinc-950">{order.documentTotal}</span>
                  <span className="text-sm text-zinc-600">{order.deliveryDate ? formatDate(order.deliveryDate) : "Не указана"}</span>
                  <span className="text-sm text-zinc-600">{order.positionCount} поз. · {order.totalUnitCount} ед.</span>
                  <span className="text-sm text-zinc-500">{formatDateTime(order.lastSynchronizedAt)}</span>
                </Link>
                <Link className="absolute right-4 top-4 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-emerald-600 hover:text-emerald-700" href={`/cabinet/orders/${order.id}/reorder`} prefetch={false}>Повторить заказ</Link>
              </li>
            ))}
          </ul>
          {result.data.totalPages > 1 ? (
            <nav aria-label="Страницы заказов" className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-sm">
              <Link className={result.data.page <= 1 ? "pointer-events-none text-zinc-300" : "font-medium text-emerald-700"} href={pageHref(result.data.page - 1, result.data.filter, result.data.search)} prefetch={false}>Назад</Link>
              <span className="text-zinc-600">Страница {result.data.page} из {result.data.totalPages}</span>
              <Link className={result.data.page >= result.data.totalPages ? "pointer-events-none text-zinc-300" : "font-medium text-emerald-700"} href={pageHref(result.data.page + 1, result.data.filter, result.data.search)} prefetch={false}>Далее</Link>
            </nav>
          ) : null}
        </div>
      )}
    </div>
  );
}

function scalar(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function filterHref(status: string, query: string): string {
  const params = new URLSearchParams({ status });
  if (query) params.set("query", query);
  return `/cabinet/orders?${params.toString()}`;
}

function pageHref(page: number, status: string, query: string): string {
  const params = new URLSearchParams({ status, page: String(Math.max(1, page)) });
  if (query) params.set("query", query);
  return `/cabinet/orders?${params.toString()}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU");
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}
