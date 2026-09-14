import Link from "next/link";

import { requireAdminPagePermission } from "@/src/modules/admin/services/admin-page-guard";
import { listExternalDemandForAdmin, listUnmetDemandForAdmin } from "@/src/modules/estimates/actions/demand.actions";
import type { MoneyByCurrency } from "@/src/modules/estimates/types";

type Params = { scope?: string; q?: string; status?: string; window?: string; page?: string };

export default async function UnmetDemandPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminPagePermission("admin.external_demand.view");
  const params = await searchParams;
  const external = params.scope === "external";
  const page = Math.max(Number(params.page ?? 1) || 1, 1);
  const window = [30, 90, 180].includes(Number(params.window)) ? Number(params.window) : 30;
  const result = external
    ? await listExternalDemandForAdmin({ search: params.q, status: params.status, page })
    : await listUnmetDemandForAdmin({ search: params.q, window, page });

  return <div className="space-y-5">
    <header>
      <p className="text-xs font-semibold uppercase text-emerald-700">Коммерческие данные</p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Неудовлетворённый спрос</h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600">Дефицит складского ассортимента и внешняя номенклатура из КП — в двух управляемых контурах.</p>
    </header>

    <nav aria-label="Контуры неудовлетворённого спроса" className="flex gap-2 border-b border-zinc-200">
      <ScopeLink active={!external} href="?scope=stock&window=30">Складской дефицит</ScopeLink>
      <ScopeLink active={external} href="?scope=external">Внешняя номенклатура</ScopeLink>
    </nav>

    {external
      ? <ExternalDemand params={params} page={page} result={result as Awaited<ReturnType<typeof listExternalDemandForAdmin>>} />
      : <StockDemand params={params} page={page} result={result as Awaited<ReturnType<typeof listUnmetDemandForAdmin>>} window={window} />}
  </div>;
}

function StockDemand({ params, page, result, window }: {
  params: Params;
  page: number;
  result: Awaited<ReturnType<typeof listUnmetDemandForAdmin>>;
  window: number;
}) {
  const cards: Array<[string, React.ReactNode]> = [
    ["Запросы", result.summary.requests],
    ["Уникальные SKU", result.summary.uniqueSku],
    ["Партнёры", result.summary.uniquePartners],
    ["Дефицит, шт.", number(result.summary.shortageUnits)],
    ["Потенциальная стоимость", money(result.summary.potentialValueByCurrency)],
  ];
  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(([label, value]) => <div className="border border-zinc-200 bg-white p-4" key={label}><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold text-zinc-950">{value}</p></div>)}
    </div>
    <form className="grid gap-2 border-y border-zinc-200 bg-white py-4 sm:grid-cols-[minmax(12rem,1fr)_10rem_auto]">
      <input name="scope" type="hidden" value="stock" />
      <input className="h-11 border border-zinc-300 px-3 text-sm" defaultValue={params.q} name="q" placeholder="SKU, товар, бренд или категория" />
      <select className="h-11 border border-zinc-300 bg-white px-3 text-sm" defaultValue={window} name="window"><option value="30">30 дней</option><option value="90">90 дней</option><option value="180">180 дней</option></select>
      <button className="min-h-11 bg-zinc-900 px-4 text-sm font-semibold text-white">Применить</button>
    </form>
    <div className="overflow-x-auto border border-zinc-200 bg-white">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-600"><tr><th className="p-3">SKU / Товар</th><th className="p-3">Бренд / Категория</th><th className="p-3">Партнёры</th><th className="p-3">Запросы</th><th className="p-3">Запрошено</th><th className="p-3">Дефицит</th><th className="p-3">Потенциал</th><th className="p-3">Последний спрос</th><th className="p-3">Тренд</th></tr></thead>
        <tbody>{result.items.map((item) => <tr className="border-t border-zinc-200" key={item.productId}>
          <td className="p-3"><Link className="font-semibold text-emerald-700" href={`/admin/commercial/unmet-demand/stock/${item.productId}?window=${window}`}>{item.sku}</Link><p className="max-w-xs text-xs text-zinc-600">{item.productName}</p></td>
          <td className="p-3">{item.brandName ?? "—"}<p className="text-xs text-zinc-500">{item.categoryName ?? "—"}</p></td>
          <td className="p-3">{item.partnerCount}</td><td className="p-3">{item.requests}</td><td className="p-3">{number(item.requestedQuantity)}</td><td className="p-3 font-semibold">{number(item.shortageQuantity)}</td><td className="p-3">{money(item.potentialValueByCurrency)}</td><td className="p-3">{date(item.lastDemandAt)}</td><td className="p-3">{trend(item.trend)}</td>
        </tr>)}</tbody>
      </table>
      {!result.items.length && <p className="p-8 text-center text-sm text-zinc-500">За выбранный период данных нет.</p>}
    </div>
    <Pagination page={page} total={result.total} href={(next) => stockHref(params, next, window)} />
  </>;
}

function ExternalDemand({ params, page, result }: { params: Params; page: number; result: Awaited<ReturnType<typeof listExternalDemandForAdmin>> }) {
  return <>
    <form className="grid gap-2 border-y border-zinc-200 bg-white py-4 sm:grid-cols-[minmax(12rem,1fr)_14rem_auto]">
      <input name="scope" type="hidden" value="external" />
      <input className="h-11 border border-zinc-300 px-3 text-sm" defaultValue={params.q} name="q" placeholder="Производитель, модель или название" />
      <select className="h-11 border border-zinc-300 bg-white px-3 text-sm" defaultValue={params.status ?? ""} name="status"><option value="">Все состояния</option><option value="new">Новые</option><option value="reviewing">На рассмотрении</option><option value="solution_proposed">Решение предложено</option><option value="closed">Закрытые</option></select>
      <button className="min-h-11 bg-zinc-900 px-4 text-sm font-semibold text-white">Применить</button>
    </form>
    <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-zinc-50 text-zinc-600"><tr><th className="p-3">Внешняя позиция</th><th className="p-3">Категория</th><th className="p-3">КП</th><th className="p-3">Партнёры</th><th className="p-3">Заказчики</th><th className="p-3">Количество</th><th className="p-3">Запросы</th><th className="p-3">Последнее</th></tr></thead><tbody>{result.items.map((item) => <tr className="border-t border-zinc-200" key={item.externalItemId}><td className="p-3"><Link className="font-semibold text-emerald-700" href={`/admin/commercial/unmet-demand/${item.externalItemId}`}>{item.manufacturer} {item.model}</Link><p className="text-xs text-zinc-500">{item.name}</p></td><td className="p-3">{item.category ?? "—"}</td><td className="p-3">{item.estimateCount}</td><td className="p-3">{item.partnerCount}</td><td className="p-3">{item.customerCount}</td><td className="p-3">{item.requestedQuantity} {item.unit}</td><td className="p-3">{item.explicitRequestCount}</td><td className="p-3">{date(item.lastObserved)}</td></tr>)}</tbody></table>{!result.items.length && <p className="p-8 text-center text-sm text-zinc-500">Данные не найдены.</p>}</div>
    <Pagination page={page} total={result.total} href={(next) => externalHref(params, next)} />
  </>;
}

function ScopeLink({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) { return <Link aria-current={active ? "page" : undefined} className={`min-h-11 border-b-2 px-3 py-3 text-sm font-semibold ${active ? "border-emerald-700 text-emerald-800" : "border-transparent text-zinc-600"}`} href={href}>{children}</Link>; }
function Pagination({ page, total, href }: { page: number; total: number; href: (page: number) => string }) { return <nav className="flex justify-between text-sm"><PageLink disabled={page <= 1} href={href(page - 1)}>Назад</PageLink><span>Страница {page}</span><PageLink disabled={page * 25 >= total} href={href(page + 1)}>Далее</PageLink></nav>; }
function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) { return disabled ? <span className="text-zinc-400">{children}</span> : <Link className="font-semibold text-emerald-700" href={href}>{children}</Link>; }
function stockHref(params: Params, page: number, window: number) { const query = new URLSearchParams({ scope: "stock", window: String(window), page: String(page) }); if (params.q) query.set("q", params.q); return `?${query}`; }
function externalHref(params: Params, page: number) { const query = new URLSearchParams({ scope: "external", page: String(page) }); if (params.q) query.set("q", params.q); if (params.status) query.set("status", params.status); return `?${query}`; }
function date(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(new Date(value)); }
function number(value: number) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value); }
function money(values: MoneyByCurrency) { const entries = Object.entries(values).filter(([currency]) => currency !== "-"); return entries.length ? entries.map(([currency, amount]) => new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount)).join(" · ") : "—"; }
function trend(value: "up" | "down" | "stable") { return value === "up" ? "↑ Рост" : value === "down" ? "↓ Снижение" : "→ Стабильно"; }
