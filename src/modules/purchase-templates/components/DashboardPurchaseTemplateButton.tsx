"use client";

import { ListRestart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { procurementCopy, usePartnerLocale } from "../../partner-locale";
import { createPurchaseTemplateFromDashboardAction } from "../actions";

export function DashboardPurchaseTemplateButton({ items }: { items: Array<{ productId: string; quantity: number }> }) {
  const copy = procurementCopy(usePartnerLocale());
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  return <div className="mt-3 flex flex-wrap items-center gap-3"><button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold hover:border-emerald-600" disabled={pending || !items.length} onClick={() => startTransition(async () => { const result = await createPurchaseTemplateFromDashboardAction({ requestKey, items }); if (result.success) { recordBehaviorInteraction({ eventName: "purchase_template_created", route: "/cabinet", sourceSurface: "dashboard_reorder" }); setRequestKey(crypto.randomUUID()); router.push(`/cabinet/purchase-templates/${result.data.id}`); } else setMessage(copy.createTemplateError); })} type="button"><ListRestart className="size-4" />{copy.saveAsTemplate}</button>{message ? <p className="text-sm text-rose-700" role="status">{message}</p> : null}</div>;
}
