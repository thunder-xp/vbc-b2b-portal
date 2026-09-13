import { ShieldAlert } from "lucide-react";

import { agentStatusCopy, complianceCopy } from "../copy";
import type { AgentCabinetContext } from "../types";

export function StatusGate({ context }: { context: AgentCabinetContext }) {
  const terminal = context.status === "TERMINATED" || context.status === "REJECTED";
  return <main className="mx-auto max-w-3xl px-4 py-12"><section className="border border-zinc-200 bg-white p-6 sm:p-8">
    <ShieldAlert aria-hidden className="text-amber-700" size={28}/>
    <h1 className="mt-4 text-2xl font-semibold">{agentStatusCopy[context.status]}</h1>
    <p className="mt-2 text-sm leading-6 text-zinc-600">{terminal ? "Операционный кабинет недоступен. История сотрудничества сохранена." : context.status === "SUSPENDED" ? "Операционные действия временно отключены. Обратитесь к координатору Novotech." : "Мы завершаем необходимые этапы. Рабочие функции появятся после активации статуса."}</p>
    <dl className="mt-6 grid gap-3 border-t border-zinc-200 pt-5 sm:grid-cols-2"><div><dt className="text-xs text-zinc-500">Код агента</dt><dd className="font-mono text-sm">{context.agentCode}</dd></div><div><dt className="text-xs text-zinc-500">Проверка</dt><dd className="text-sm">{complianceCopy[context.complianceStatus]}</dd></div></dl>
  </section></main>;
}
