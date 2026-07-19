import { listInternalOrderDateChangesAction } from "@/src/modules/orders/actions";
import { InternalOrderDateChangeReview } from "@/src/modules/orders/components";

export default async function InternalOrderDateChangesPage() {
  const result = await listInternalOrderDateChangesAction();
  return <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="border-b border-zinc-200 pb-5"><p className="text-xs font-semibold uppercase text-emerald-700">Internal workspace</p><h1 className="mt-2 text-2xl font-semibold">Переносы планируемой отгрузки</h1><p className="mt-1 text-sm text-zinc-600">Решение фиксируется в портале. Дату заказа менеджер изменяет в 1С.</p></header>
    {!result.success ? <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">Недостаточно прав или очередь недоступна.</p> : result.data.length ? <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Партнёр</th><th className="px-4 py-3">Заказ</th><th className="px-4 py-3">Текущая дата</th><th className="px-4 py-3">Новая дата</th><th className="px-4 py-3">Комментарий</th><th className="px-4 py-3">Решение</th></tr></thead><tbody className="divide-y divide-zinc-100">{result.data.map((record) => <tr key={record.request.id}><td className="px-4 py-4 font-medium">{record.companyName}</td><td className="px-4 py-4">{record.orderLabel}</td><td className="px-4 py-4">{formatDate(record.authoritativeDate)}</td><td className="px-4 py-4 font-semibold">{formatDate(record.request.requestedDate)}</td><td className="max-w-64 px-4 py-4 text-zinc-600">{record.request.comment ?? "—"}</td><td className="w-64 px-4 py-4"><InternalOrderDateChangeReview requestId={record.request.id} /></td></tr>)}</tbody></table></div> : <p className="border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-500">Запросов на рассмотрении нет.</p>}
  </div></main>;
}

function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU"); }
