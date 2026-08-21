import Link from "next/link";
import { notFound } from "next/navigation";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { getPurchaseTemplateAction } from "@/src/modules/purchase-templates/actions";
import { PurchaseTemplateEditor } from "@/src/modules/purchase-templates/components";
import { procurementCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function PurchaseTemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const [{ templateId }, locale] = await Promise.all([params, getPartnerLocale()]);
  const copy = procurementCopy(locale);
  const result = await getPurchaseTemplateAction(templateId);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND" || result.errorCode === "INVALID_INPUT") notFound();
    return <p className="border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{copy.templateUnavailable}</p>;
  }
  return <div className="space-y-6">
    <BehaviorViewEvent dedupeKey={`purchase-template:${result.data.id}`} eventName="purchase_template_opened" route="/cabinet/purchase-templates/detail" sourceSurface="purchase_template_detail" />
    <header className="border-b border-zinc-200 pb-5"><Link className="text-sm font-medium text-emerald-700" href="/cabinet/purchase-templates" prefetch={false}>← {copy.templates}</Link><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{result.data.name}</h1>{result.data.status === "archived" ? <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold">{copy.archive}</span> : null}</div><p className="mt-2 text-sm text-zinc-600">{copy.templateCommercialHint}</p></header>
    <PurchaseTemplateEditor initial={result.data} key={`${result.data.id}:${result.data.revision}`} />
  </div>;
}
