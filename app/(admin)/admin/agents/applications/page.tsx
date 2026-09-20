import Link from "next/link";

import { createCommercialAgentApplicationService } from "@/src/modules/agent-application";
import { requireAdminPagePermission } from "@/src/modules/admin/services";

export default async function CommercialAgentApplicationsAdminPage() {
  await requireAdminPagePermission("admin.agents.manage");
  const applications = await createCommercialAgentApplicationService().listForAdmin();
  return (
    <main className="space-y-5">
      <header>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800" href="/admin/agents">← Коммерческие агенты</Link>
        <h1 className="mt-2 text-3xl font-semibold">Заявки коммерческих агентов</h1>
        <p className="mt-2 text-sm text-zinc-600">Заявка не является профилем агента и не открывает доступ в кабинет.</p>
      </header>
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {applications.length ? <div className="divide-y divide-zinc-100">{applications.map((application) => (
          <Link className="grid min-h-16 gap-2 p-4 hover:bg-zinc-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={`/admin/agents/applications/${application.id}`} key={application.id}>
            <span><strong className="block">{application.displayName ?? "Черновик заявителя"}</strong><span className="mt-1 block text-sm text-zinc-500">{application.email ?? application.phone ?? "Контакт не указан"}</span></span>
            <span className="text-sm font-semibold text-zinc-700">{adminStatusLabel(application.status)}</span>
          </Link>
        ))}</div> : <p className="p-6 text-sm text-zinc-600">Заявок пока нет.</p>}
      </section>
    </main>
  );
}

function adminStatusLabel(status: string) {
  return {
    DRAFT: "Черновик",
    SUBMITTED: "На проверке",
    NEEDS_CLARIFICATION: "Запрошено уточнение",
    APPROVED: "Одобрена",
    REJECTED: "Отклонена",
    WITHDRAWN: "Отозвана",
  }[status] ?? "Неизвестное состояние";
}
