"use client";

import { ShoppingCart } from "lucide-react";
import { useState, useTransition } from "react";

import { addCampaignItemToCartAction } from "../actions/commercial-campaign.actions";

export function CampaignCartControl({ itemId, minimum, maximum }: { itemId: string; minimum: number; maximum: number | null }) {
  const [quantity, setQuantity] = useState(minimum);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="mt-4 flex flex-wrap items-end gap-2">
    <label className="grid gap-1 text-xs font-medium text-zinc-600">Количество<input aria-label="Количество товара" className="h-11 w-24 rounded-md border border-zinc-300 px-3 text-base" max={maximum ?? 9999} min={minimum} onChange={(event) => setQuantity(Number(event.target.value))} type="number" value={quantity} /></label>
    <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending || quantity < minimum || Boolean(maximum && quantity > maximum)} onClick={() => startTransition(async () => { const result = await addCampaignItemToCartAction({ campaignItemId: itemId, quantity, requestId }); setMessage(result.message); if (result.success) setRequestId(crypto.randomUUID()); })} type="button"><ShoppingCart aria-hidden="true" className="size-4" />{pending ? "Добавляем..." : "Добавить в корзину"}</button>
    {message ? <p className={`w-full text-sm ${message.startsWith("Добавлено") ? "text-emerald-700" : "text-rose-700"}`} role="status">{message}</p> : null}
  </div>;
}
