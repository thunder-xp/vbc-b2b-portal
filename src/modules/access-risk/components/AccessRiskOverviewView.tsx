import Link from "next/link";

import type { AccessRiskOverview } from "../types";
import { AccessRiskBadge } from "./AccessRiskBadge";

export function AccessRiskOverviewView({ data, filters }: {
  data: AccessRiskOverview;
  filters: { query: string; riskState: string; mode: string; sort: string; page: number };
}) {
  const stale = !data.diagnostics || data.diagnostics.isStale;
  return <div className="space-y-5">
    {stale && <div role="status" className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Проекция обновляется асинхронно. Последний снимок старше двух часов или ещё не создан.</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Metric label="Высокий" value={data.kpis.high} tone="red" />
      <Metric label="Повышенный" value={data.kpis.elevated} tone="amber" />
      <Metric label="Низкий" value={data.kpis.low} />
      <Metric label="Обучение" value={data.kpis.learning} />
      <Metric label="Расширенный" value={data.kpis.enhanced} tone="blue" />
      <Metric label="Всего компаний" value={data.kpis.total} />
    </div>
    <form className="grid gap-3 border border-zinc-200 bg-white p-3 xl:grid-cols-[minmax(220px,1fr)_170px_170px_180px_auto]" method="get">
      <label className="text-xs font-medium text-zinc-600">Компания<input name="q" defaultValue={filters.query} placeholder="Поиск" className="mt-1 h-10 w-full border border-zinc-300 px-3 text-sm" /></label>
      <Select label="Риск" name="risk" value={filters.riskState} options={[['','Все'],['HIGH','Высокий'],['ELEVATED','Повышенный'],['LOW','Низкий'],['LEARNING','Обучение']]} />
      <Select label="Режим" name="mode" value={filters.mode} options={[['','Все'],['NORMAL','Обычный'],['ENHANCED','Расширенный']]} />
      <Select label="Сортировка" name="sort" value={filters.sort} options={[['risk_desc','По риску'],['activity_desc','По активности'],['company_asc','По компании']]} />
      <button className="h-10 self-end bg-zinc-950 px-4 text-sm font-semibold text-white">Применить</button>
    </form>
    <div className="overflow-x-auto border border-zinc-200 bg-white">
      <table className="min-w-[1320px] w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-3 py-2">Компания</th><th className="px-3 py-2">Риск</th><th className="px-3 py-2">Причины</th><th className="px-3 py-2">Пользователи</th><th className="px-3 py-2">Устройства</th><th className="px-3 py-2">Сети</th><th className="px-3 py-2">SKU просмотры</th><th className="px-3 py-2">Коммерческие действия</th><th className="px-3 py-2">Активность</th><th className="px-3 py-2">Мониторинг</th><th className="px-3 py-2"><span className="sr-only">Действие</span></th></tr></thead>
        <tbody className="divide-y divide-zinc-100">{data.items.map((item) => <tr key={item.id}>
          <td className="px-3 py-3 font-semibold text-zinc-950">{item.displayName}</td>
          <td className="px-3 py-3"><AccessRiskBadge state={item.riskState} /> <span className="ml-2 tabular-nums text-zinc-500">{item.riskScore}</span></td>
          <td className="max-w-[280px] px-3 py-3 text-xs text-zinc-600">{item.reasonCodes.length ? item.reasonCodes.map(reasonLabel).join(" · ") : "Нет активных сигналов"}</td>
          <td className="px-3 py-3 tabular-nums">{item.affectedUserCount} / {item.activeUserCount}</td>
          <td className="px-3 py-3 tabular-nums">{item.devices24h}</td>
          <td className="px-3 py-3 tabular-nums">{item.networks24h}</td>
          <td className="px-3 py-3 tabular-nums">{item.uniqueSkus24h}</td>
          <td className="px-3 py-3 tabular-nums">{item.commercialIntents24h}</td>
          <td className="px-3 py-3 text-xs text-zinc-600">{item.lastActivityAt ? formatDate(item.lastActivityAt) : "Нет данных"}</td>
          <td className="px-3 py-3"><span className={item.mode === "ENHANCED" ? "font-semibold text-blue-700" : "text-zinc-600"}>{item.mode === "ENHANCED" ? "Расширенный" : "Обычный"}</span>{item.enhancedUntil && <div className="text-xs text-zinc-500">до {formatDate(item.enhancedUntil)}</div>}</td>
          <td className="px-3 py-3 text-right"><Link prefetch={false} className="inline-flex h-10 items-center border border-zinc-300 px-3 font-semibold hover:bg-zinc-50" href={`/admin/security/access-risk/${item.id}`}>Открыть</Link></td>
        </tr>)}</tbody>
      </table>
      {!data.items.length && <p className="p-6 text-center text-sm text-zinc-500">Компании не найдены.</p>}
    </div>
    <Pagination filters={filters} page={data.page} pageSize={data.pageSize} total={data.total} />
    {data.diagnostics && <p className="text-xs text-zinc-500">Последняя оценка: {formatDate(data.diagnostics.completedAt)} · компаний {data.diagnostics.companiesEvaluated} · пользователей {data.diagnostics.usersEvaluated} · {data.diagnostics.durationMs} мс.</p>}
  </div>;
}

function Metric({ label, value, tone = "zinc" }: { label: string; value: number; tone?: "zinc" | "red" | "amber" | "blue" }) { const color = { zinc:"text-zinc-950",red:"text-red-700",amber:"text-amber-800",blue:"text-blue-700" }[tone]; return <div className="border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">{label}</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p></div>; }
function Select({ label, name, value, options }: { label:string; name:string; value:string; options:Array<[string,string]> }) { return <label className="text-xs font-medium text-zinc-600">{label}<select name={name} defaultValue={value} className="mt-1 h-10 w-full border border-zinc-300 bg-white px-2 text-sm">{options.map(([option,labelText])=><option key={option} value={option}>{labelText}</option>)}</select></label>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle:"short", timeStyle:"short" }).format(new Date(value)); }
export function reasonLabel(code: string): string { return ({ NEW_DEVICE_SURGE:"Новые устройства",CONCURRENT_SESSION_ANOMALY:"Параллельные сессии",NETWORK_CHURN:"Смена сетей",BROWSE_VOLUME_ANOMALY:"Объём просмотров",UNIQUE_SKU_SURGE:"Много SKU",CATEGORY_BREADTH_ANOMALY:"Широкий охват категорий",COMMERCIAL_DEAD_END:"Нет коммерческого продолжения",HIGH_VELOCITY_BROWSING:"Высокая скорость" } as Record<string,string>)[code] ?? code; }
function Pagination({ filters, page, pageSize, total }: { filters:{query:string;riskState:string;mode:string;sort:string}; page:number; pageSize:number; total:number }) { const max=Math.max(1,Math.ceil(total/pageSize)); const href=(target:number)=>{ const p=new URLSearchParams(); if(filters.query)p.set("q",filters.query); if(filters.riskState)p.set("risk",filters.riskState); if(filters.mode)p.set("mode",filters.mode); if(filters.sort)p.set("sort",filters.sort); p.set("page",String(target)); return `?${p}`; }; return <nav aria-label="Страницы" className="flex items-center justify-between text-sm"><span className="text-zinc-500">Страница {page} из {max}</span><div className="flex gap-2">{page>1&&<Link className="inline-flex h-10 items-center border border-zinc-300 px-3" href={href(page-1)}>Назад</Link>}{page<max&&<Link className="inline-flex h-10 items-center border border-zinc-300 px-3" href={href(page+1)}>Далее</Link>}</div></nav>; }
