import Link from "next/link";
import { Plus } from "lucide-react";

import { createAgentCabinetService } from "@/src/modules/agent-cabinet";
import { AgentPageHeader, primaryButton } from "@/src/modules/agent-cabinet/components/PageHeader";
import { NumberedPagination } from "@/src/modules/platform-ui/NumberedPagination";

export default async function AgentClientsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1); const result = await createAgentCabinetService().clients(page);
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:py-8"><AgentPageHeader title="Мои клиенты" actions={<Link className={primaryButton} href="/agent/qr#referral-link"><Plus size={18}/>Добавить клиента</Link>}/>{result.items.length ? <div className="border border-zinc-200 bg-white"><div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 border-b border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-500 md:grid"><span>Клиент</span><span>Город / объект</span><span>Закрепление</span><span>Защита до</span></div>{result.items.map(item => <Link className="grid min-h-20 gap-2 border-b border-zinc-100 p-4 last:border-0 hover:bg-zinc-50 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:items-center" href={`/agent/clients/${item.id}`} key={item.id}><span><strong className="block text-sm">{item.name}</strong><small className="text-zinc-500">{item.phone ?? item.email ?? "Контакт не указан"}</small></span><span className="text-sm text-zinc-600">{[item.locality,item.objectType].filter(Boolean).join(" · ") || "—"}</span><span className="text-sm">{clientStatus(item.status)}</span><span className="text-sm tabular-nums">{date(item.extendedUntil ?? item.protectionUntil)}</span></Link>)}</div> : <section className="border border-zinc-200 bg-white p-6 text-sm text-zinc-600">После подтверждения первой заявки клиент появится здесь.</section>}<NumberedPagination ariaLabel="Страницы клиентов" currentPage={page} hrefForPage={p => `/agent/clients?page=${p}`} totalPages={Math.ceil(result.total/20)}/></main>;
}
function clientStatus(s:string){return s==="ACTIVE"?"Активно":s==="EXPIRED"?"Срок завершён":s==="REASSIGNED"?"Передано":"Завершено"} function date(v:string){return new Intl.DateTimeFormat("ru-MD",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(v))}
