import {
  listAdminSupportTicketsAction,
  listSupportAssigneesAction,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  SupportTicketList,
} from "@/src/modules/partner-support";

type SearchParams = Record<string, string | undefined>;
const field = "min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm";

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [result, assigneesResult] = await Promise.all([
    listAdminSupportTicketsAction(params),
    listSupportAssigneesAction(),
  ]);
  const assignees = assigneesResult.success ? assigneesResult.data : [];

  return <div className="space-y-6">
    <header><p className="text-xs font-semibold uppercase text-emerald-700">Операции</p><h1 className="mt-1 text-2xl font-semibold">Partner Support Helpdesk</h1><p className="mt-2 text-sm text-zinc-600">Очередь IT-заявок партнёров.</p></header>
    <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <input className={field} defaultValue={params.query} name="query" placeholder="Номер или заявитель" />
      <input className={field} defaultValue={params.company} name="company" placeholder="Компания или IDNO" />
      <select className={field} defaultValue={params.mode ?? ""} name="mode"><option value="">Все очереди</option><option value="new">Новые</option><option value="high_priority">Высокий приоритет</option><option value="unassigned">Без исполнителя</option><option value="waiting">Ожидают партнёра</option><option value="overdue">Просроченные</option><option value="resolved">Решённые</option></select>
      <select className={field} defaultValue={params.status ?? ""} name="status"><option value="">Все статусы</option>{SUPPORT_STATUSES.map((value) => <option key={value} value={value}>{SUPPORT_STATUS_LABELS[value]}</option>)}</select>
      <select className={field} defaultValue={params.priority ?? ""} name="priority"><option value="">Все приоритеты</option>{SUPPORT_PRIORITIES.map((value) => <option key={value} value={value}>{SUPPORT_PRIORITY_LABELS[value]}</option>)}</select>
      <select className={field} defaultValue={params.assignee ?? ""} name="assignee"><option value="">Все исполнители</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select>
      <select className={field} defaultValue={params.category ?? ""} name="category"><option value="">Все категории</option>{SUPPORT_CATEGORIES.map((value) => <option key={value} value={value}>{SUPPORT_CATEGORY_LABELS[value]}</option>)}</select>
      <div className="grid grid-cols-2 gap-2"><input aria-label="Создана с" className={field} defaultValue={params.createdFrom} name="createdFrom" type="date" /><input aria-label="Создана по" className={field} defaultValue={params.createdTo} name="createdTo" type="date" /></div>
      <button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white sm:col-span-2 xl:col-span-4">Применить фильтры</button>
    </form>
    {result.success ? <SupportTicketList admin page={result.data} /> : <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Не удалось загрузить очередь.</p>}
  </div>;
}
