import { listAdminServiceCasesAction, ServiceCaseList, SERVICE_STATUSES, SERVICE_STATUS_LABELS } from "@/src/modules/service-center";
import { AdminOneCServiceHistoryList, listAdminOneCServiceHistoryAction } from "@/src/modules/service-history";

export default async function AdminServicePage({ searchParams }: { searchParams: Promise<{ query?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const [portal, imported] = await Promise.all([listAdminServiceCasesAction(params), listAdminOneCServiceHistoryAction({ query: params.query, page: params.page })]);
  return <div className="space-y-8">
    <header><p className="text-xs font-semibold uppercase text-emerald-700">Операции</p><h1 className="mt-1 text-2xl font-semibold">Сервисные обращения</h1><p className="mt-2 text-sm text-zinc-600">Заявки партнёров и импортированная история обслуживания из 1С.</p></header>
    <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]"><input className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={params.query} name="query" placeholder="Заявка, компания, товар, серийный номер" /><select className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={params.status ?? ""} name="status"><option value="">Все статусы заявок</option>{SERVICE_STATUSES.map((value) => <option key={value} value={value}>{SERVICE_STATUS_LABELS[value]}</option>)}</select><button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white">Найти</button></form>
    <section className="space-y-3" aria-labelledby="portal-service-title"><div><h2 className="text-lg font-semibold" id="portal-service-title">Заявки из кабинета</h2><p className="text-sm text-zinc-600">Рабочий процесс управляется в портале.</p></div>{portal.success ? <ServiceCaseList admin page={portal.data} /> : <ErrorState />}</section>
    <section className="space-y-3" aria-labelledby="one-c-service-title"><div><h2 className="text-lg font-semibold" id="one-c-service-title">История обслуживания из 1С</h2><p className="text-sm text-zinc-600">Данные доступны только для просмотра. Статусы изменяются в 1С.</p></div>{imported.success ? <AdminOneCServiceHistoryList page={imported.data} /> : <ErrorState />}</section>
  </div>;
}

function ErrorState() { return <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Не удалось загрузить сервисные данные.</p>; }
