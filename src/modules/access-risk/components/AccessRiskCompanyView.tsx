import Link from "next/link";

import { setAccessRiskMonitoringAction } from "../actions";
import type { AccessRiskCompanyDetail } from "../types";
import { AccessRiskBadge } from "./AccessRiskBadge";
import { reasonLabel } from "./AccessRiskOverviewView";

export function AccessRiskCompanyView({ data, canManage }: { data: AccessRiskCompanyDetail; canManage: boolean }) {
  const state = data.snapshot.riskState ?? "LEARNING";
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-200 bg-white p-4">
      <div><div className="flex items-center gap-2"><AccessRiskBadge state={state} /><span className="text-sm tabular-nums text-zinc-500">Оценка {data.snapshot.riskScore ?? 0}</span></div><p className="mt-2 text-xs text-zinc-500">Снимок {data.snapshot.evaluatedAt ? formatDate(data.snapshot.evaluatedAt) : "ещё не рассчитан"}. Мониторинг не блокирует доступ и коммерческие операции.</p></div>
      <Link className="inline-flex h-10 items-center border border-zinc-300 px-3 text-sm font-semibold hover:bg-zinc-50" href="/admin/security">Открыть центр доступа</Link>
    </div>
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold text-zinc-950">Пользователи и причины</h2>
        <div className="mt-3 divide-y divide-zinc-100">{data.users.map((user) => <article key={user.id} className="grid gap-3 py-3 md:grid-cols-[minmax(180px,1fr)_auto_minmax(220px,1fr)] md:items-start">
          <div><p className="font-medium text-zinc-950">{user.name || maskEmail(user.email)}</p><p className="text-xs text-zinc-500">{maskEmail(user.email)} · база {user.baselineDays} дн.</p></div>
          <div><AccessRiskBadge state={user.riskState} /> <span className="ml-1 text-xs tabular-nums text-zinc-500">{user.riskScore}</span></div>
          <div className="text-xs text-zinc-600">{user.reasons.length ? user.reasons.map((reason) => <div key={reason.code}>{reasonLabel(reason.code)}: {reason.observed} / {reason.threshold}</div>) : "Сигналы не активны"}</div>
        </article>)}</div>
        {!data.users.length && <p className="mt-3 text-sm text-zinc-500">Профиль обучается; пользовательские снимки появятся после фоновой оценки.</p>}
      </div>
      <MonitoringPanel data={data} canManage={canManage} />
    </section>
    <section className="border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3"><h2 className="font-semibold text-zinc-950">Ограниченная временная шкала</h2><p className="mt-1 text-xs text-zinc-500">Детальные псевдонимные события доступны только в активном расширенном режиме и удаляются не позднее 30 дней.</p></div>
      {data.monitoring.mode === "NORMAL" ? <p className="p-5 text-sm text-zinc-600">Обычный режим хранит только агрегаты. Историческая детальная активность недоступна.</p> : <Timeline data={data} />}
    </section>
    <section className="border border-zinc-200 bg-white p-4"><h2 className="font-semibold text-zinc-950">История режима</h2><div className="mt-3 space-y-2 text-sm">{data.monitoringEvents.map((event)=><div key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 pb-2"><span>{monitoringEventLabel(event.eventType)}{event.reason ? ` · ${event.reason}` : ""}</span><time className="text-xs text-zinc-500">{formatDate(event.occurredAt)}</time></div>)}{!data.monitoringEvents.length&&<p className="text-zinc-500">Изменений режима не было.</p>}</div></section>
  </div>;
}

function MonitoringPanel({ data, canManage }: { data: AccessRiskCompanyDetail; canManage: boolean }) {
  const enhanced = data.monitoring.mode === "ENHANCED";
  return <aside className="border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-zinc-950">Режим мониторинга</h2><span className={enhanced ? "text-sm font-semibold text-blue-700" : "text-sm text-zinc-600"}>{enhanced ? "Расширенный" : "Обычный"}</span></div>{data.monitoring.expiresAt&&<p className="mt-2 text-xs text-zinc-500">Автоматически завершится {formatDate(data.monitoring.expiresAt)}</p>}
    {!canManage ? <p className="mt-4 text-sm text-zinc-500">Для изменения режима требуется admin.security.manage.</p> : enhanced ? <form action={setAccessRiskMonitoringAction} className="mt-4"><input type="hidden" name="companyId" value={data.company.id}/><input type="hidden" name="mode" value="NORMAL"/><input type="hidden" name="durationDays" value="14"/><label className="text-xs font-medium text-zinc-600">Причина остановки<input required minLength={3} maxLength={500} name="reason" className="mt-1 h-10 w-full border border-zinc-300 px-3 text-sm"/></label><button className="mt-3 h-11 w-full border border-zinc-400 px-4 text-sm font-semibold">Завершить расширенный мониторинг</button></form> : <form action={setAccessRiskMonitoringAction} className="mt-4 space-y-3"><input type="hidden" name="companyId" value={data.company.id}/><input type="hidden" name="mode" value="ENHANCED"/><label className="block text-xs font-medium text-zinc-600">Срок<select name="durationDays" defaultValue="14" className="mt-1 h-10 w-full border border-zinc-300 bg-white px-3 text-sm"><option value="7">7 дней</option><option value="14">14 дней</option><option value="30">30 дней</option></select></label><label className="block text-xs font-medium text-zinc-600">Обоснование<input required minLength={3} maxLength={500} name="reason" className="mt-1 h-10 w-full border border-zinc-300 px-3 text-sm" placeholder="Причина проверки"/></label><button className="h-11 w-full bg-zinc-950 px-4 text-sm font-semibold text-white">Включить расширенный режим</button><p className="text-xs text-zinc-500">Максимум 30 дней. Режим завершится автоматически и не изменит права пользователя.</p></form>}
  </aside>;
}

function Timeline({ data }: { data: AccessRiskCompanyDetail }) { return <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="bg-zinc-50 text-left text-xs text-zinc-500"><tr><th className="px-3 py-2">Время</th><th className="px-3 py-2">Событие</th><th className="px-3 py-2">Маршрут</th><th className="px-3 py-2">Пользователь</th><th className="px-3 py-2">Устройство / сеть</th><th className="px-3 py-2">Регион</th></tr></thead><tbody className="divide-y divide-zinc-100">{data.timeline.map((item)=><tr key={item.id}><td className="px-3 py-2 text-xs text-zinc-600">{formatDate(item.occurredAt)}</td><td className="px-3 py-2 font-medium">{item.eventName}</td><td className="px-3 py-2 text-xs text-zinc-600">{item.routeFamily}</td><td className="px-3 py-2 font-mono text-xs">{shortHash(item.userId)}</td><td className="px-3 py-2 font-mono text-xs text-zinc-600">{shortHash(item.deviceHash)} / {item.networkHash ? shortHash(item.networkHash) : "—"}</td><td className="px-3 py-2 text-xs">{[item.countryCode,item.regionCode].filter(Boolean).join("-")||"—"}</td></tr>)}</tbody></table>{!data.timeline.length&&<p className="p-5 text-sm text-zinc-500">После активации подробные события ещё не поступили.</p>}{data.hasMoreTimeline&&<p className="border-t border-zinc-100 p-3 text-xs text-zinc-500">Показаны последние 50 событий. Следующая страница доступна через bounded cursor API.</p>}</div>; }
function formatDate(value:string){return new Intl.DateTimeFormat("ru-RU",{dateStyle:"short",timeStyle:"short"}).format(new Date(value));}
function shortHash(value:string){return value.length>14?`${value.slice(0,7)}…${value.slice(-6)}`:value;}
function maskEmail(value:string){const [name,domain]=value.split("@");return domain?`${name.slice(0,2)}***@${domain}`:"Пользователь";}
function monitoringEventLabel(value:string){return ({ENHANCED_ACTIVATED:"Расширенный режим включён",ENHANCED_STOPPED:"Расширенный режим завершён",ENHANCED_EXPIRED:"Расширенный режим завершён автоматически"} as Record<string,string>)[value]??value;}
