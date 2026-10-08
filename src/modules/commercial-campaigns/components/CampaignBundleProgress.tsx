"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { PartnerLocale } from "@/src/modules/partner-locale";
import { completeCampaignBundleAction } from "../actions/commercial-campaign.actions";
import type { CampaignBundleState as BundleProgress } from "../types";

/** All qualification, progress and stock decisions arrive from the server basket authority. */
export function CampaignBundleProgress({ progress, locale, mechanicType, compact=false }: { progress: BundleProgress; locale: PartnerLocale; mechanicType?: import("../types").CampaignMechanicType; compact?:boolean }) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const ro = locale === "ro";
  const special = mechanicType === "bundle_special_price";
  return <section className="mt-4 min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-3" aria-label={ro ? "Componența setului" : "Состав комплекта"}>
    <p className="text-sm font-semibold" data-testid="bundle-status">{special ? progress.eligible ? ro ? "Set complet / preț special activ" : "Набор собран / спеццена активна" : ro ? "Set la preț special" : "Набор по спеццене" : progress.eligible
      ? ro ? "Set complet / PROMO activă" : "Комплект собран / PROMO активна"
      : ro ? "Set → PROMO" : "Комплект → PROMO"}</p>
    {!compact?<ul className="mt-2 grid gap-2 text-sm">
      {progress.components.map((component) => <li className="min-w-0" key={component.campaignItemId}>
        <span className="block break-words font-medium">SKU {component.sku} · {component.name}</span>
        <span className="text-xs text-zinc-600">{ro ? "În coș" : "В корзине"}: {component.currentQuantity} / {component.requiredBundleQuantity}</span>
        {component.missingQuantity > 0 ? <span className="ml-2 text-xs text-zinc-700">{special ? ro ? "Mai lipsesc în set" : "Не хватает в наборе" : ro ? "Mai lipsesc pentru PROMO" : "До PROMO не хватает"}: {component.missingQuantity}</span> : null}
      </li>)}
    </ul>:null}
    {!progress.conditionsReady ? <p className="mt-2 text-xs text-amber-800">{special ? ro ? "Condițiile ofertei nu sunt disponibile." : "Условия предложения недоступны." : ro ? "Condițiile PROMO nu sunt disponibile." : "Условия PROMO недоступны."}</p> : null}
    {!progress.stockReady ? <p className="mt-2 text-xs text-amber-800">{ro ? "Stoc insuficient pentru setul complet." : "Недостаточно наличия для полного комплекта."}</p> : null}
    <button className="mt-3 min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300"
      disabled={pending || !progress.conditionsReady || (mechanicType !== "bundle_special_price" && !progress.stockReady) || progress.eligible}
      onClick={() => startTransition(async () => {
        requestId.current ??= crypto.randomUUID();
        const result = await completeCampaignBundleAction({ campaignId: progress.campaignId, publicationVersion: progress.publicationVersion, requestId: requestId.current });
        setMessage(result.success ? ro ? "Set adăugat în coș." : result.message : ro ? "Set indisponibil. Verificați condițiile." : result.message);
        if (result.success) { requestId.current = null; router.refresh(); }
      })} type="button">{pending ? ro ? "Se adaugă…" : "Добавляем…" : mechanicType === "bundle_special_price" ? ro ? "Adaugă setul în coș" : "Добавить набор в корзину" : ro ? "Adaugă setul" : "Добавить комплект"}</button>
    {message ? <p className="mt-2 text-xs" role="status">{message}</p> : null}
  </section>;
}
