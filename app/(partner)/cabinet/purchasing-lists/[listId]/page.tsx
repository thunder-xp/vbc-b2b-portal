import { Layers3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPurchasingListAction } from "@/src/modules/purchasing-lists/actions";
import { PurchasingListActions, PurchasingListEditor } from "@/src/modules/purchasing-lists/components";
import { getSavedKitCopy, procurementCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function PurchasingListDetailPage({ params }: { params: Promise<{ listId: string }> }) {
  const [{ listId }, locale] = await Promise.all([params, getPartnerLocale()]);
  const copy = procurementCopy(locale);
  const kitCopy = getSavedKitCopy(locale);
  const result = await getPurchasingListAction(listId);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return <p className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{copy.listUnavailable}</p>;
  }

  const list = result.data;
  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="border-b border-zinc-200 pb-5">
      <Link className="text-sm font-semibold text-emerald-700" href={list.isSystemFavorites ? "/cabinet/purchasing-lists?filter=favorites" : "/cabinet/purchasing-lists"}>← {list.isSystemFavorites ? copy.favorites : kitCopy.title}</Link>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><h1 className="text-2xl font-semibold">{list.name}</h1>{list.archivedAt ? <span className="rounded bg-zinc-200 px-2 py-1 text-xs font-semibold">{copy.archive}</span> : null}</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {!list.isSystemFavorites && !list.archivedAt ? <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href={`/cabinet/quick-order?kit=${encodeURIComponent(list.id)}#saved-kits`}><Layers3 aria-hidden="true" className="size-4" />{kitCopy.useKit}</Link> : null}
          <PurchasingListActions archived={Boolean(list.archivedAt)} canManage={list.canManage} description={list.description} isSystemFavorites={Boolean(list.isSystemFavorites)} listId={list.id} name={list.name} revision={list.revision} visibility={list.visibility} />
        </div>
      </div>
    </header>
    <PurchasingListEditor initial={list} />
  </div>;
}
