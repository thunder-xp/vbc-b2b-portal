"use client";

import { Clock3, ShoppingCart } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { addPublicRetailCctvSystemAction } from "../actions/retail-cart.actions";
import { createPublicRetailCommercialOfferAction } from "../actions/retail-checkout.actions";
import { formatRetailPrice } from "../presentation";
import type { PublicRetailCommercialOfferDto } from "../types";
import type { PublicRetailLocale } from "../types";
import { PUBLIC_RETAIL_CART_UPDATED_EVENT } from "./PublicRetailCartBadgeClient";

export function PublicRetailAddSystemButton({ locale, items, installationIntent, installationPricing, calculatorInput, workScope, selectedVariant, offerEnabled = true }: { locale: PublicRetailLocale; items: Array<{ publicProductId: string; quantity: number; commercialGroup: "equipment" | "materials"; unitCode: "piece" | "meter" | "service" }>; installationIntent: Record<string, boolean> | null; installationPricing: Record<string, unknown> | null; calculatorInput: Record<string, unknown>; workScope: Array<{ kind: string; quantity: number; unitCode: "piece" | "meter" | "service" }>; selectedVariant: "recommended" | "economy"; offerEnabled?: boolean }) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(false);
  const [offer, setOffer] = useState<PublicRetailCommercialOfferDto | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const ru = locale === "ru";

  useEffect(() => {
    if (!offer || offer.status !== "active") return;
    const update = () => setRemainingSeconds(Math.max(0, Math.floor((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [offer]);

  return <div><button className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={pending || selected} onClick={() => startTransition(async () => {
    const result = await addPublicRetailCctvSystemAction({ locale, items, installationIntent, installationPricing, calculatorInput, workScope, requestId });
    setMessage(result.message);
    if (result.success && result.data) {
      setSelected(true);
      setRequestId(crypto.randomUUID());
      window.dispatchEvent(new CustomEvent(PUBLIC_RETAIL_CART_UPDATED_EVENT, { detail: { totalQuantity: result.data.totalQuantity } }));
    }
  })} type="button"><ShoppingCart aria-hidden="true" className="size-4" />{pending ? (ru ? "Добавляем..." : "Se adaugă...") : selected ? (ru ? "Выбрано" : "Selectat") : selectedVariant === "economy" ? (ru ? "Выбрать эконом-вариант" : "Alege varianta economică") : (ru ? "Добавить систему в корзину" : "Adaugă sistemul în coș")}</button>
    <p aria-live="polite" className="mt-2 min-h-5 text-xs text-emerald-700">{message}</p>
    {offerEnabled && selectedVariant === "economy" && selected && !offer ? <button className="mt-2 min-h-11 w-full text-sm font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-4 disabled:opacity-60" disabled={pending} onClick={() => startTransition(async () => {
      const result = await createPublicRetailCommercialOfferAction({ locale, idempotencyKey: crypto.randomUUID() });
      setMessage(result.message);
      if (result.offer) setOffer(result.offer);
    })} type="button">{ru ? "Всё ещё дорого?" : "Este încă prea scump?"}</button> : null}
    {offer?.status === "active" && remainingSeconds > 0 ? <section className="mt-3 border border-emerald-200 bg-emerald-50 p-4 text-left text-emerald-950">
      <div className="flex items-center gap-2 font-semibold"><Clock3 aria-hidden="true" className="size-4" />{ru ? "−10% на оборудование" : "−10% la echipamente"}</div>
      <p className="mt-1 text-sm">{ru ? "При оплате в течение часа. Материалы и монтаж не участвуют в скидке." : "La plata în decurs de o oră. Materialele și instalarea nu sunt reduse."}</p>
      <p className="mt-2 text-sm font-semibold tabular-nums" aria-label={ru ? `Предложение действует до ${new Date(offer.expiresAt).toLocaleTimeString("ru-MD")}` : `Oferta este valabilă până la ${new Date(offer.expiresAt).toLocaleTimeString("ro-MD")}`}>{formatCountdown(remainingSeconds)} · −{formatRetailPrice(offer.discountAmount, offer.currency, locale)}</p>
    </section> : null}
  </div>;
}

function formatCountdown(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
