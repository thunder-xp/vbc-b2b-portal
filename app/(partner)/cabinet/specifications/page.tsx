import { FilePlus2 } from "lucide-react";
import Link from "next/link";

import { listProjectSpecificationsAction } from "@/src/modules/project-specifications/actions";
import { StatusBadge } from "@/src/modules/project-specifications/components";
import { actionClassName, PageHeader } from "@/src/modules/platform-ui";

export default async function ProjectSpecificationsPage() {
  const result = await listProjectSpecificationsAction();
  return <div className="space-y-6"><PageHeader actions={<Link className={actionClassName.primary} href="/cabinet/specifications/new"><FilePlus2 className="size-4" />Новая спецификация</Link>} description="Комплектация оборудования для объектов заказчиков." title="Проектные спецификации" />{!result.success ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.message}</p> : result.data.length ? <div className="grid gap-3">{result.data.map((specification) => <Link className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-emerald-500 sm:grid-cols-[1fr_auto]" href={`/cabinet/specifications/${specification.id}`} key={specification.id}><div><h2 className="font-semibold">{specification.projectName}</h2><p className="mt-1 text-sm text-zinc-500">{specification.customerSiteName} · {specification.itemCount} позиций</p></div><StatusBadge status={specification.status} /></Link>)}</div> : <section className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-14 text-center"><FilePlus2 className="mx-auto size-8 text-emerald-700" /><h2 className="mt-4 font-semibold">Спецификаций пока нет</h2><p className="mt-1 text-sm text-zinc-500">Создайте первую ведомость оборудования для проекта.</p></section>}</div>;
}
