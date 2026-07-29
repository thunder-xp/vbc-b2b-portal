import Link from "next/link";
import { redirect } from "next/navigation";

import { listInternalSpecificationsAction } from "@/src/modules/project-specifications/actions";
import { StatusBadge } from "@/src/modules/project-specifications/components";
import { requireAdminPagePermission } from "@/src/modules/admin";
import { PageHeader } from "@/src/modules/platform-ui";

export default async function AdminSpecificationsPage() {
  await requireAdminPagePermission("specifications.review");
  const result = await listInternalSpecificationsAction();
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");

  return <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6"><PageHeader description="Коммерческие ведомости, отправленные партнёрами на рассмотрение." eyebrow="Рабочая область Novotech" title="Спецификации партнёров" />{!result.success ? <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.message}</p> : result.data.length ? <><div className="grid gap-3 md:hidden">{result.data.map((item) => <article className="border border-zinc-200 bg-white p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link className="font-semibold text-zinc-950" href={`/admin/specifications/${item.id}`}>{item.projectName}</Link><p className="mt-1 truncate text-sm text-zinc-600">{item.customerSiteName}</p></div><StatusBadge status={item.status} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-zinc-500">Партнёр</dt><dd className="mt-1 font-medium">{item.companyName}</dd></div><div><dt className="text-xs text-zinc-500">Отправлена</dt><dd className="mt-1">{formatDate(item.submittedAt)}</dd></div><div><dt className="text-xs text-zinc-500">Позиций</dt><dd className="mt-1">{item.itemCount}</dd></div><div><dt className="text-xs text-zinc-500">Закупка</dt><dd className="mt-1 font-medium">{item.partnerPurchaseTotal ?? "—"}</dd></div></dl></article>)}</div><div className="hidden overflow-x-auto border border-zinc-200 bg-white md:block"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Отправлена</th><th className="px-4 py-3">Партнёр</th><th className="px-4 py-3">Проект / объект</th><th className="px-4 py-3">Позиций</th><th className="px-4 py-3">Закупка</th><th className="px-4 py-3">Розница</th><th className="px-4 py-3">Прибыль</th><th className="px-4 py-3">Статус</th></tr></thead><tbody className="divide-y divide-zinc-100">{result.data.map((item) => <tr key={item.id}><td className="px-4 py-4">{formatDate(item.submittedAt)}</td><td className="px-4 py-4 font-medium">{item.companyName}</td><td className="px-4 py-4"><Link className="font-semibold text-zinc-950 hover:text-emerald-700" href={`/admin/specifications/${item.id}`}>{item.projectName}</Link><div className="mt-1 text-xs text-zinc-500">{item.customerSiteName}</div></td><td className="px-4 py-4">{item.itemCount}</td><td className="px-4 py-4">{item.partnerPurchaseTotal ?? "—"}</td><td className="px-4 py-4">{item.retailTotal ?? "—"}</td><td className="px-4 py-4">{item.potentialGrossProfit ?? "—"}</td><td className="px-4 py-4"><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div></> : <p className="border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-500">Отправленных спецификаций пока нет.</p>}</div></main>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
