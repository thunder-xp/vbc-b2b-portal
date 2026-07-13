import Link from "next/link";
import { redirect } from "next/navigation";

import { listInternalSpecificationsAction } from "@/src/modules/project-specifications/actions";
import { StatusBadge } from "@/src/modules/project-specifications/components";

export default async function AdminSpecificationsPage() {
  const result = await listInternalSpecificationsAction();
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");

  return <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6"><header className="border-b border-zinc-200 pb-5"><p className="text-xs font-semibold uppercase text-emerald-700">Internal workspace</p><h1 className="mt-2 text-2xl font-semibold">Спецификации партнёров</h1><p className="mt-1 text-sm text-zinc-600">Коммерческие ведомости, отправленные партнёрами на рассмотрение.</p></header>{!result.success ? <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.message}</p> : result.data.length ? <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Отправлена</th><th className="px-4 py-3">Партнёр</th><th className="px-4 py-3">Проект / объект</th><th className="px-4 py-3">Позиций</th><th className="px-4 py-3">Закупка</th><th className="px-4 py-3">Розница</th><th className="px-4 py-3">Прибыль</th><th className="px-4 py-3">Статус</th></tr></thead><tbody className="divide-y divide-zinc-100">{result.data.map((item) => <tr key={item.id}><td className="px-4 py-4">{formatDate(item.submittedAt)}</td><td className="px-4 py-4 font-medium">{item.companyName}</td><td className="px-4 py-4"><Link className="font-semibold text-zinc-950 hover:text-emerald-700" href={`/admin/specifications/${item.id}`}>{item.projectName}</Link><div className="mt-1 text-xs text-zinc-500">{item.customerSiteName}</div></td><td className="px-4 py-4">{item.itemCount}</td><td className="px-4 py-4">{item.partnerPurchaseTotal ?? "—"}</td><td className="px-4 py-4">{item.retailTotal ?? "—"}</td><td className="px-4 py-4">{item.potentialGrossProfit ?? "—"}</td><td className="px-4 py-4"><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div> : <p className="border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-500">Отправленных спецификаций пока нет.</p>}</div></main>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
