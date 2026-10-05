"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { PartnerLocale } from "@/src/modules/partner-locale";
import { addCampaignItemToCartAction } from "../actions/commercial-campaign.actions";
import type { CampaignSpendState } from "../types";

/** Presentation of server-owned USD progress. No browser eligibility or monetary calculation. */
export function CampaignSpendProgress({ progress, locale }: { progress: CampaignSpendState; locale: PartnerLocale }) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const ro = locale === "ro";
  const reward = progress.reward;
  return <section aria-label={ro ? "Suma achiziției → PROMO" : "Сумма закупки → PROMO"} className="mt-4 min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-3">
    <p className="text-sm font-semibold" data-testid="spend-status">{!progress.conditionsReady
      ? ro ? "Condițiile PROMO nu sunt disponibile." : "Условия PROMO недоступны."
      : progress.eligible ? ro ? "PROMO activă" : "PROMO активна"
        : progress.thresholdReached ? ro ? "Prag atins · PROMO deblocată" : "Порог достигнут · PROMO открыта"
          : ro ? `Până la PROMO mai sunt ${displayUsd(progress.remainingSpendUsd)} USD` : `До PROMO осталось ${displayUsd(progress.remainingSpendUsd)} USD`}</p>
    <p className="mt-1 text-xs text-zinc-600">{ro ? "Achiziție eligibilă" : "Сумма закупки"}: {displayUsd(progress.qualifyingSpendUsd)} / {displayUsd(progress.thresholdAmountUsd)} USD</p>
    <p className="mt-2 text-xs text-zinc-600">{ro ? "Se calculează doar produsele de mai jos, la prețul de bază al partenerului în USD. Produsul cu PROMO nu contribuie." : "Учитываются только товары ниже по базовой цене партнёра в USD. Товар с PROMO не входит в сумму."}</p>
    <ul className="mt-2 grid gap-1 text-sm">{progress.qualifyingProducts.map((product) => <li className="break-words" key={product.campaignItemId}>SKU {product.sku} · {product.name} · {product.currentQuantity} {ro ? "buc." : "шт."}</li>)}</ul>
    {reward ? <p className="mt-2 break-words text-sm">{ro ? "Produs cu PROMO" : "Товар с PROMO"}: SKU {reward.sku} · {reward.name}</p> : null}
    {!progress.rewardStockReady && reward ? <p className="mt-2 text-xs text-amber-800">{ro ? "Disponibilitatea produsului cu PROMO necesită confirmare." : "Наличие товара с PROMO требует подтверждения."}</p> : null}
    {reward && progress.conditionsReady && progress.thresholdReached && !progress.rewardPresent ? <button className="mt-3 min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending || !progress.rewardStockReady} onClick={() => startTransition(async () => {
      requestId.current ??= crypto.randomUUID();
      const result = await addCampaignItemToCartAction({ campaignItemId: reward.campaignItemId, publicationVersion: progress.publicationVersion, quantity: reward.minimumQuantity, requestId: requestId.current });
      setMessage(result.success ? ro ? "Produs adăugat în coș." : "Товар добавлен в корзину." : ro ? "Oferta nu este disponibilă." : result.message);
      if (result.success) { requestId.current = null; router.refresh(); }
    })} type="button">{pending ? ro ? "Se adaugă…" : "Добавляем…" : ro ? "Adaugă cu PROMO" : "Добавить по PROMO"}</button> : null}
    {message ? <p className="mt-2 text-xs" role="status">{message}</p> : null}
  </section>;
}

function displayUsd(value: string): string { return new Decimal(value).toDecimalPlaces(2).toString(); }
