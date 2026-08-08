import { notFound } from "next/navigation";

import { requireAdminPagePermission } from "@/src/modules/admin/services/admin-page-guard";
import { getExternalDemandForAdmin, searchExternalDemandProductsForAdmin } from "@/src/modules/estimates/actions/demand.actions";
import { ExternalDemandAdminControls } from "@/src/modules/estimates/components";

export default async function ExternalDemandDetailPage({ params, searchParams }: { params: Promise<{ externalItemId: string }>; searchParams: Promise<{ productQuery?: string }> }) {
  await requireAdminPagePermission("admin.external_demand.view");
  const [{ externalItemId }, query] = await Promise.all([params, searchParams]);
  const [detail, products] = await Promise.all([getExternalDemandForAdmin(externalItemId), searchExternalDemandProductsForAdmin(query.productQuery ?? "")]);
  if (!detail) notFound();
  return <div className="space-y-5">
    <header><p className="text-xs font-semibold uppercase text-emerald-700">Внешняя номенклатура</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950">{detail.item.manufacturer} {detail.item.model}</h1><p className="mt-1 text-sm text-zinc-600">{detail.item.name} · {detail.item.category ?? "Категория не указана"}</p></header>
    <form className="flex flex-wrap gap-2 border-y border-zinc-200 py-4"><input className="h-11 min-w-0 flex-1 border border-zinc-300 px-3 text-sm" defaultValue={query.productQuery} name="productQuery" placeholder="Найти товар Novotech по SKU или названию" /><button className="min-h-11 bg-zinc-900 px-4 text-sm font-semibold text-white">Найти товар</button></form>
    <ExternalDemandAdminControls detail={detail} products={products} />
  </div>;
}
