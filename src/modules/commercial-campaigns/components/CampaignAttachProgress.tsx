"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { PartnerLocale } from "@/src/modules/partner-locale";
import { addCampaignItemToCartAction } from "../actions/commercial-campaign.actions";
import type { CampaignAttachState } from "../types";

/** Server-owned basket progress; the browser sends only item and quantity intent. */
export function CampaignAttachProgress({ progress, locale }: { progress: CampaignAttachState; locale: PartnerLocale }) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const ro = locale === "ro";
  const reward = progress.reward;
  return <section className="mt-4 min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-3" aria-label={ro ? "Condiții pentru PROMO" : "Условия PROMO"}>
    <p className="text-sm font-semibold" data-testid="attach-status">{progress.eligible
      ? ro ? "PROMO activă" : "PROMO активна"
      : progress.conditionsReady && progress.triggersSatisfied ? ro ? "PROMO deblocată" : "PROMO открыта"
        : ro ? "Cumpără X → PROMO pentru Y" : "Купи X → PROMO на Y"}</p>
    <ul className="mt-2 grid gap-2 text-sm">{progress.triggers.map((trigger) => <li className="min-w-0" key={trigger.campaignItemId}>
      <span className="block break-words font-medium">SKU {trigger.sku} · {trigger.name}</span>
      <span className="text-xs text-zinc-600">{ro ? "În coș" : "В корзине"}: {trigger.currentQuantity} / {trigger.requiredTriggerQuantity}</span>
      {trigger.missingQuantity > 0 ? <span className="ml-2 text-xs text-zinc-700">{ro ? "Mai lipsesc" : "Не хватает"}: {trigger.missingQuantity}</span> : null}
    </li>)}</ul>
    {reward ? <p className="mt-2 break-words text-sm">{ro ? "Produs cu PROMO" : "Товар с PROMO"}: SKU {reward.sku} · {reward.name}</p> : null}
    {!progress.conditionsReady ? <p className="mt-2 text-xs text-amber-800">{ro ? "Condițiile PROMO nu sunt disponibile." : "Условия PROMO недоступны."}</p> : null}
    {!progress.triggerStockReady || !progress.rewardStockReady ? <p className="mt-2 text-xs text-amber-800">{ro ? "Stoc insuficient pentru ofertă." : "Недостаточно наличия для предложения."}</p> : null}
    {reward && progress.conditionsReady && progress.triggersSatisfied && !progress.rewardPresent ? <button
      className="mt-3 min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300"
      disabled={pending || !progress.triggerStockReady || !progress.rewardStockReady}
      onClick={() => startTransition(async () => {
        requestId.current ??= crypto.randomUUID();
        const result = await addCampaignItemToCartAction({ campaignItemId: reward.campaignItemId, quantity: reward.minimumQuantity, requestId: requestId.current });
        setMessage(result.success ? ro ? "Produs adăugat în coș." : "Товар добавлен в корзину." : ro ? "Oferta nu este disponibilă." : result.message);
        if (result.success) { requestId.current = null; router.refresh(); }
      })} type="button">{pending ? ro ? "Se adaugă…" : "Добавляем…" : ro ? "Adaugă produsul cu PROMO" : "Добавить товар по PROMO"}</button> : null}
    {message ? <p className="mt-2 text-xs" role="status">{message}</p> : null}
  </section>;
}
