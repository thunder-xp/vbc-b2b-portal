import Link from "next/link";

import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { getPartnerMomentumDiagnosticsAction, listPartnerMomentumAdminAction } from "@/src/modules/partner-momentum/actions";
import type { MomentumStatus } from "@/src/modules/partner-momentum/types";

const STATUS_OPTIONS: Array<{ value: MomentumStatus | ""; label: string }> = [
  { value: "", label: "Все статусы" },
  { value: "high_risk", label: "Высокий риск потери" },
  { value: "attention_required", label: "Требует внимания" },
  { value: "slowing", label: "Снижение активности" },
  { value: "recovered", label: "Восстановление" },
  { value: "stable", label: "Стабильно" },
  { value: "growth", label: "Рост" },
  { value: "insufficient_history", label: "Недостаточно истории" },
];

export default async function PartnerMomentumAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPagePermission("partner_momentum.view_assigned");
  const params = await searchParams;
  const page = positive(params.page, 1);
  const status = scalar(params.status);
  const search = scalar(params.search);
  const [result, diagnostics] = await Promise.all([
    listPartnerMomentumAdminAction({ page, pageSize: 25, status, search }),
    getPartnerMomentumDiagnosticsAction().catch(() => ({})),
  ]);
  const data = result.success ? result.data : { items: [], totalCount: 0 };
  const diagnosticRecord = record(diagnostics);
  const byStatus = record(diagnosticRecord.byStatus);

  return <div className="space-y-6">
    <AdminPageHeader eyebrow="Коммерческие данные" title="Динамика партнёров" description="Покупательская активность относительно собственного исторического ритма каждой компании. Оценка детерминирована и не сравнивает партнёров между собой." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Доступно для анализа" value={numeric(diagnosticRecord.eligibleCompanies)} />
      <Metric label="Требует внимания" value={numeric(byStatus.attention_required)} />
      <Metric label="Высокий риск" value={numeric(byStatus.high_risk)} />
      <Metric label="Восстановились" value={numeric(byStatus.recovered)} />
      <Metric label="В очереди" value={numeric(diagnosticRecord.dirtyCompanies)} />
    </div>
    <form className="grid gap-3 border border-zinc-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto]" method="get">
      <label className="text-sm font-medium text-zinc-700">Компания или фискальный код<input className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3" defaultValue={search ?? ""} name="search" /></label>
      <label className="text-sm font-medium text-zinc-700">Статус<select className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3" defaultValue={status ?? ""} name="status">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <button className="min-h-11 self-end rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white" type="submit">Применить</button>
    </form>
    <section aria-label="Партнёры по динамике">
      {data.items.length ? <div className="grid gap-3">
        {data.items.map((item) => <article className="grid gap-4 border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(7rem,auto))] md:items-center" key={item.companyId}>
          <div className="min-w-0"><h2 className="font-semibold text-zinc-950">{item.companyName}</h2><p className="mt-1 text-xs text-zinc-500">{item.managerName ?? "Менеджер не назначен"}</p><div className="mt-2 flex flex-wrap gap-1">{item.reasonCodes.slice(0,3).map((reason) => <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700" key={reason}>{reasonLabel(reason)}</span>)}</div></div>
          <Datum label="Статус" value={statusLabel(item.status)} />
          <Datum label="Оценка" value={item.score === null ? "—" : `${item.score}/100`} />
          <Datum label="Заказы, 60 дней" value={`${item.orderCountCurrent} / ${item.orderCountBaseline}`} />
          <Datum label="SKU, 60 дней" value={`${item.skuCountCurrent} / ${item.skuCountBaseline}`} />
        </article>)}
      </div> : <p className="border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Компании по выбранным условиям не найдены.</p>}
    </section>
    <Pagination page={page} total={data.totalCount} search={search} status={status} />
  </div>;
}

function Pagination({ page, total, search, status }: { page: number; total: number; search: string | null; status: string | null }) {
  const pages = Math.max(1, Math.ceil(total / 25));
  if (pages <= 1) return null;
  const href = (target: number) => { const params = new URLSearchParams(); params.set("page", String(target)); if (search) params.set("search", search); if (status) params.set("status", status); return `?${params}`; };
  return <nav aria-label="Страницы" className="flex items-center justify-between"><Link aria-disabled={page <= 1} className="min-h-11 px-3 py-3 text-sm font-semibold text-emerald-700 aria-disabled:pointer-events-none aria-disabled:text-zinc-400" href={href(Math.max(1,page-1))}>Назад</Link><span className="text-sm text-zinc-600">{page} из {pages}</span><Link aria-disabled={page >= pages} className="min-h-11 px-3 py-3 text-sm font-semibold text-emerald-700 aria-disabled:pointer-events-none aria-disabled:text-zinc-400" href={href(Math.min(pages,page+1))}>Далее</Link></nav>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>; }
function Datum({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-900">{value}</p></div>; }
function statusLabel(value: MomentumStatus) { return ({ growth:"Рост",stable:"Стабильно",slowing:"Снижение активности",attention_required:"Требует внимания",high_risk:"Высокий риск потери",insufficient_history:"Недостаточно истории",recovered:"Восстановление" } as Record<MomentumStatus,string>)[value]; }
function reasonLabel(value: string) { return ({ order_volume_down:"Объём ниже обычного",order_frequency_down:"Заказов меньше",purchase_cycle_overdue:"Цикл закупки просрочен",assortment_breadth_down:"Меньше товарных позиций",no_orders_in_current_window:"Нет заказов за период",active_cart_not_converted:"Есть незавершённая корзина",template_not_used:"Есть готовый шаблон",price_opportunity_available:"Есть возможность для закупки",campaign_available:"Доступно предложение",recovered_after_order:"Закупки возобновились" } as Record<string,string>)[value] ?? "Требует проверки"; }
function scalar(value: string | string[] | undefined): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function positive(value: string | string[] | undefined, fallback: number): number { const parsed=Number(scalar(value)); return Number.isInteger(parsed)&&parsed>0?parsed:fallback; }
function record(value: unknown): Record<string, unknown> { return typeof value === "object"&&value!==null&&!Array.isArray(value)?value as Record<string,unknown>:{}; }
function numeric(value: unknown): number { const parsed=Number(value); return Number.isFinite(parsed)?parsed:0; }
