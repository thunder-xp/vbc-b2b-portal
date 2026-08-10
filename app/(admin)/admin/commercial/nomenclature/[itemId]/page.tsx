import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPagePermission } from "@/src/modules/admin/services/admin-page-guard";
import { getAdminNomenclatureDetailAction } from "@/src/modules/estimates/actions";
import { AdminNomenclatureEditor } from "@/src/modules/estimates/components/AdminNomenclatureEditor";

export default async function AdminNomenclatureDetailPage({params}:{params:Promise<{itemId:string}>}){
  await requireAdminPagePermission("admin.external_nomenclature.view");const {itemId}=await params;const item=await getAdminNomenclatureDetailAction(itemId);if(!item)notFound();
  return <div className="space-y-5"><header><Link className="text-sm font-semibold text-emerald-700" href="/admin/commercial/nomenclature">← Номенклатура партнёров</Link><h1 className="mt-2 text-2xl font-semibold">{item.name}</h1><p className="mt-1 text-sm text-zinc-500">{item.companyCount} компаний · {item.estimateCount} смет · версия {item.version}</p></header><AdminNomenclatureEditor item={item}/>
    <section><h2 className="text-lg font-semibold">История управления</h2><div className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200">{item.events.map(event=><div className="grid gap-1 py-3 text-sm sm:grid-cols-[14rem_1fr_auto]" key={event.id}><strong>{event.eventType}</strong><span>{event.reason??"—"}</span><time className="text-zinc-500">{new Intl.DateTimeFormat("ru-RU",{dateStyle:"short",timeStyle:"short"}).format(new Date(event.createdAt))}</time></div>)}{!item.events.length?<p className="py-5 text-sm text-zinc-500">Событий пока нет.</p>:null}</div></section>
  </div>;
}
