import { FilePlus2 } from "lucide-react";
import Link from "next/link";

import { listProjectSpecificationsAction } from "@/src/modules/project-specifications/actions";
import { StatusBadge } from "@/src/modules/project-specifications/components";

export default async function ProjectSpecificationsPage() {
  const result = await listProjectSpecificationsAction();
  return <div className="space-y-6"><header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold">Проектные спецификации</h1><p className="mt-1 text-sm text-zinc-500">Комплектация оборудования для объектов заказчиков.</p></div><Link className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white" href="/cabinet/specifications/new"><FilePlus2 className="size-4" />Новая спецификация</Link></header>{!result.success ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.message}</p> : result.data.length ? <div className="grid gap-3">{result.data.map((specification) => <Link className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-emerald-500 sm:grid-cols-[1fr_auto]" href={`/cabinet/specifications/${specification.id}`} key={specification.id}><div><h2 className="font-semibold">{specification.projectName}</h2><p className="mt-1 text-sm text-zinc-500">{specification.customerSiteName} · {specification.itemCount} позиций</p></div><StatusBadge status={specification.status} /></Link>)}</div> : <section className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-14 text-center"><FilePlus2 className="mx-auto size-8 text-emerald-700" /><h2 className="mt-4 font-semibold">Спецификаций пока нет</h2><p className="mt-1 text-sm text-zinc-500">Создайте первую ведомость оборудования для проекта.</p></section>}</div>;
}
