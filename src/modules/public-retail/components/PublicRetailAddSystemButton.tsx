"use client";

import { ShoppingCart } from "lucide-react";
import { useState, useTransition } from "react";

import { addPublicRetailCctvSystemAction } from "../actions/retail-cart.actions";
import type { PublicRetailLocale } from "../types";
import { PUBLIC_RETAIL_CART_UPDATED_EVENT } from "./PublicRetailCartBadgeClient";

export function PublicRetailAddSystemButton({ locale, items, installationIntent, calculatorInput, workScope }: { locale: PublicRetailLocale; items: Array<{ publicProductId: string; quantity: number; commercialGroup: "equipment" | "materials"; unitCode: "piece" | "meter" | "service" }>; installationIntent: Record<string, boolean> | null; calculatorInput: Record<string, unknown>; workScope: Array<{ kind: string; quantity: number; unitCode: "piece" | "meter" | "service" }> }) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const ru = locale === "ru";

  return <div><button className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} onClick={() => startTransition(async () => {
    const result = await addPublicRetailCctvSystemAction({ locale, items, installationIntent, calculatorInput, workScope, requestId });
    setMessage(result.message);
    if (result.success && result.data) {
      setRequestId(crypto.randomUUID());
      window.dispatchEvent(new CustomEvent(PUBLIC_RETAIL_CART_UPDATED_EVENT, { detail: { totalQuantity: result.data.totalQuantity } }));
    }
  })} type="button"><ShoppingCart aria-hidden="true" className="size-4" />{pending ? (ru ? "Добавляем..." : "Se adaugă...") : (ru ? "Добавить систему в корзину" : "Adaugă sistemul în coș")}</button><p aria-live="polite" className="mt-2 min-h-5 text-xs text-emerald-700">{message}</p></div>;
}
