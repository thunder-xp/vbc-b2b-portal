"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { PartnerLocale } from "@/src/modules/partner-locale";
import { completeCampaignBundleAction } from "../actions/commercial-campaign.actions";
import type { CampaignBundleState as BundleProgress } from "../types";

/** All qualification, progress and stock decisions arrive from the server basket authority. */
export function CampaignBundleProgress({ progress, locale }: { progress: BundleProgress; locale: PartnerLocale }) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const ro = locale === "ro";
  return <section className="mt-4 min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-3" aria-label={ro ? "Componența setului" : "Состав комплекта"}>
    <p className="text-sm font-semibold" data-testid="bundle-status">{progress.eligible
      ? ro ? "Set complet / PROMO activă" : "Комплект собран / PROMO активна"
      : ro ? "Set → PROMO" : "Комплект → PROMO"}</p>
    <ul className="mt-2 grid gap-2 text-sm">
      {progress.components.map((component) => <li className="min-w-0" key={component.campaignItemId}>
        <span className="block break-words font-medium">SKU {component.sku} · {component.name}</span>
        <span className="text-xs text-zinc-600">{ro ? "În coș" : "В корзине"}: {component.currentQuantity} / {component.requiredBundleQuantity}</span>
        {component.missingQuantity > 0 ? <span className="ml-2 text-xs text-zinc-700">{ro ? "Mai lipsesc pentru PROMO" : "До PROMO не хватает"}: {component.missingQuantity}</span> : null}
      </li>)}
    </ul>
    {!progress.conditionsReady ? <p className="mt-2 text-xs text-amber-800">{ro ? "Condițiile PROMO nu sunt disponibile." : "Условия PROMO недоступны."}</p> : null}
    {!progress.stockReady ? <p className="mt-2 text-xs text-amber-800">{ro ? "Stoc insuficient pentru setul complet." : "Недостаточно наличия для полного комплекта."}</p> : null}
    <button className="mt-3 min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300"
      disabled={pending || !progress.conditionsReady || !progress.stockReady || progress.eligible}
      onClick={() => startTransition(async () => {
        requestId.current ??= crypto.randomUUID();
        const result = await completeCampaignBundleAction({ campaignId: progress.campaignId, requestId: requestId.current });
        setMessage(result.success ? ro ? "Set adăugat în coș." : result.message : ro ? "Set indisponibil. Verificați condițiile." : result.message);
        if (result.success) { requestId.current = null; router.refresh(); }
      })} type="button">{pending ? ro ? "Se adaugă…" : "Добавляем…" : ro ? "Adaugă setul" : "Добавить комплект"}</button>
    {message ? <p className="mt-2 text-xs" role="status">{message}</p> : null}
  </section>;
}
