import Link from "next/link";
import { notFound } from "next/navigation";

import { OneCServiceHistorySummary, getAdminOneCServiceHistoryAction } from "@/src/modules/service-history";

export default async function AdminServiceHistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getAdminOneCServiceHistoryAction(id);
  if (!result.success || !result.data) notFound();
  return <div className="mx-auto max-w-5xl space-y-6"><header><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href="/admin/service">← Сервисные обращения</Link><p className="mt-2 text-xs font-semibold uppercase text-zinc-500">Импортировано из 1С · только чтение</p><h1 className="mt-1 text-2xl font-semibold">{result.data.number}</h1></header><OneCServiceHistorySummary detail={result.data} /></div>;
}
