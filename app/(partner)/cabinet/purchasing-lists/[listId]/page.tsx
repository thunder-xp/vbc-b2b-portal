import { notFound } from "next/navigation";

import { getPurchasingListAction } from "@/src/modules/purchasing-lists/actions";
import { PurchasingListEditor } from "@/src/modules/purchasing-lists/components";
import { procurementCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function PurchasingListDetailPage({ params }: { params: Promise<{ listId: string }> }) {
  const [{ listId }, locale] = await Promise.all([params, getPartnerLocale()]);
  const copy = procurementCopy(locale);
  const result = await getPurchasingListAction(listId);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return <p className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{copy.listUnavailable}</p>;
  }

  const list = result.data;
  return <div className="mx-auto max-w-7xl"><PurchasingListEditor initial={list} key={`${list.id}:${list.revision}`} /></div>;
}
