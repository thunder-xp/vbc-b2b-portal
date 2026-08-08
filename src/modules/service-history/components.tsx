import Link from "next/link";

import { ProductImage } from "@/src/modules/catalog/components/ProductImage";
import { ONE_C_SERVICE_STATUS_LABELS, type AdminOneCServiceHistoryPage, type OneCServiceHistoryDetail, type UnifiedServiceHistoryPage } from "./types";

const portalStatusLabels: Record<string, string> = {
  created: "Заявка создана",
  accepted: "Принята",
  awaiting_equipment: "Ожидается оборудование",
  equipment_received: "Оборудование получено",
  diagnostics: "Диагностика",
  awaiting_information: "Ожидается информация",
  repair: "В ремонте",
  replacement_approved: "Одобрена замена",
  awaiting_replacement: "Ожидается замена",
  ready_for_pickup: "Готово к выдаче",
  closed: "Закрыто",
  rejected: "Отклонено",
  cancelled: "Отменено",
};

export function UnifiedServiceHistoryList({ page, query = "", filter = "all" }: { page: UnifiedServiceHistoryPage; query?: string; filter?: string }) {
  if (!page.items.length) {
    return <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center"><h3 className="font-semibold">История пока пуста</h3><p className="mt-2 text-sm text-zinc-600">Сервисные документы и заявки появятся здесь после регистрации.</p></div>;
  }

  const pages = Math.max(1, Math.ceil(page.total / 20));
  return <><div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
    <ul className="divide-y divide-zinc-200">
      {page.items.map((item) => <li key={`${item.sourceType}:${item.id}`}>
        <Link className="grid min-h-28 gap-3 p-4 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:grid-cols-[72px_minmax(0,1fr)_180px_auto] sm:items-center" href={item.href} prefetch={false}>
          <div className="aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
            <ProductImage alt={item.productName ?? "Оборудование"} sizes="72px" src={item.productImageUrl} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-emerald-700">{item.number}</p>
            <p className="mt-1 line-clamp-2 font-medium" title={item.productName ?? undefined}>{item.productName ?? "Оборудование уточняется"}</p>
            <p className="mt-1 text-xs text-zinc-500">{[item.productSku, item.maskedSerial].filter(Boolean).join(" · ") || "Без дополнительной маркировки"}</p>
            {item.reportedFault ? <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{item.reportedFault}</p> : null}
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900">{statusLabel(item.status)}</p>
            {item.status === "ready_for_pickup" ? <p className="mt-1 text-sm font-semibold text-emerald-700">Оборудование готово к выдаче.</p> : null}
            <p className="mt-1 text-xs text-zinc-500">{new Date(item.date).toLocaleDateString("ru-RU")}</p>
          </div>
          <span className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold">Открыть</span>
        </Link>
      </li>)}
    </ul>
  </div>{pages > 1 ? <nav aria-label="Страницы истории" className="flex items-center justify-between gap-3"><PaginationLink disabled={page.page <= 1} filter={filter} page={page.page - 1} query={query}>Назад</PaginationLink><span className="text-sm text-zinc-600">Страница {page.page} из {pages}</span><PaginationLink disabled={page.page >= pages} filter={filter} page={page.page + 1} query={query}>Далее</PaginationLink></nav> : null}</>;
}

export function OneCServiceHistorySummary({ detail }: { detail: OneCServiceHistoryDetail }) {
  return <div className="space-y-7">
    <section className="grid gap-4 border-b border-zinc-200 pb-6 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Статус" value={ONE_C_SERVICE_STATUS_LABELS[detail.status]} />
      <Metric label="Дата приёма" value={new Date(detail.date).toLocaleDateString("ru-RU")} />
      <Metric label="Серийный номер" value={detail.maskedSerial ?? "Не указан"} />
      <Metric label="Гарантия" value={warrantyLabel(detail.warrantyState)} />
    </section>
    <section className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
      <div className="aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
        <ProductImage alt={detail.product.name ?? "Оборудование"} sizes="160px" src={detail.product.imageUrl} />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{detail.product.name ?? "Оборудование уточняется"}</h2>
        {detail.product.sku ? <p className="mt-1 text-sm text-zinc-500">SKU: {detail.product.sku}</p> : null}
        {detail.product.href ? <Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={detail.product.href}>Открыть товар</Link> : null}
      </div>
    </section>
    <TextSection title="Заявленная неисправность" value={detail.reportedFault ?? "Описание не указано."} />
    {detail.resolution ? <TextSection title="Результат обслуживания" value={detail.resolution} /> : null}
    <section className="grid gap-4 sm:grid-cols-2">
      <Metric label="Гарантия до" value={formatOptionalDate(detail.warrantyEndDate)} />
      <Metric label="Сервисный центр" value={detail.serviceCenter ?? "Не указан"} />
    </section>
    {detail.events.length ? <section><h2 className="text-lg font-semibold">История статусов</h2><ol className="mt-3 space-y-3">{detail.events.map((event) => <li className="flex flex-col gap-1 border-l-2 border-emerald-200 pl-3 sm:flex-row sm:justify-between" key={event.id}><span className="text-sm text-zinc-700">{ONE_C_SERVICE_STATUS_LABELS[event.status]}</span><time className="text-xs text-zinc-500">{new Date(event.occurredAt).toLocaleString("ru-RU")}</time></li>)}</ol></section> : null}
  </div>;
}

export function AdminOneCServiceHistoryList({ page }: { page: AdminOneCServiceHistoryPage }) {
  if (!page.items.length) return <p className="rounded-md border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">Импортированных документов пока нет.</p>;
  return <div className="overflow-hidden rounded-md border border-zinc-200 bg-white"><ul className="divide-y divide-zinc-200">{page.items.map((item) => <li key={item.id}><Link className="grid min-h-20 gap-2 p-4 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:grid-cols-[150px_minmax(0,1fr)_190px_auto] sm:items-center" href={item.href}><div><p className="font-semibold">{item.number}</p><p className="text-xs text-zinc-500">{new Date(item.date).toLocaleDateString("ru-RU")}</p></div><div><p className="font-medium">{item.product_name ?? "Товар не сопоставлен"}</p><p className="text-xs text-zinc-500">{item.company_name ?? "Компания не сопоставлена"}{item.sku ? ` · ${item.sku}` : ""}</p></div><span className="text-sm">{ONE_C_SERVICE_STATUS_LABELS[item.status]}</span><span className="text-xs font-semibold uppercase text-zinc-500">Только чтение</span></Link></li>)}</ul></div>;
}

function statusLabel(status: string) { return ONE_C_SERVICE_STATUS_LABELS[status as keyof typeof ONE_C_SERVICE_STATUS_LABELS] ?? portalStatusLabels[status] ?? "Статус уточняется"; }
function warrantyLabel(value: string | null) { return ({ eligible: "Гарантия подтверждена", expired: "Гарантия истекла", active: "Гарантия действует" } as Record<string, string>)[value ?? ""] ?? "Требует проверки"; }
function formatOptionalDate(value: string | null) { return value ? new Date(value).toLocaleDateString("ru-RU") : "Не указано"; }
function Metric({ label, value }: { label: string; value: string }) { return <dl><dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt><dd className="mt-1 text-sm font-medium text-zinc-900">{value}</dd></dl>; }
function TextSection({ title, value }: { title: string; value: string }) { return <section><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{value}</p></section>; }
function PaginationLink({ children, disabled, filter, page, query }: { children: React.ReactNode; disabled: boolean; filter: string; page: number; query: string }) {
  if (disabled) return <span aria-disabled="true" className="inline-flex min-h-11 items-center px-3 text-sm text-zinc-400">{children}</span>;
  const params = new URLSearchParams({ filter, page: String(page) });
  if (query) params.set("query", query);
  return <Link className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold" href={`/cabinet/service?${params}`}>{children}</Link>;
}
