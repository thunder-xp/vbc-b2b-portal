"use client";

import { ShoppingCart } from "lucide-react";
import { useState, useTransition } from "react";

import { addPublicRetailProductAction } from "../actions/retail-cart.actions";
import type { PublicRetailLocale } from "../types";
import { PUBLIC_RETAIL_CART_UPDATED_EVENT } from "./PublicRetailCartBadgeClient";

export function PublicRetailAddToCartButton({ publicProductId, locale, source, compact = false }: { publicProductId: string; locale: PublicRetailLocale; source: "catalog" | "product_detail"; compact?: boolean }) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const ru = locale === "ru";

  return <div className="public-catalog-cart-action"><button className={`public-primary-action public-catalog-cart-button ${compact ? "" : "sm:w-auto"}`} disabled={pending} onClick={() => startTransition(async () => {
    const result = await addPublicRetailProductAction({ publicProductId, quantity: 1, source, requestId, locale });
    setMessage(result.message);
    if (result.success && result.data) {
      setRequestId(crypto.randomUUID());
      window.dispatchEvent(new CustomEvent(PUBLIC_RETAIL_CART_UPDATED_EVENT, { detail: { totalQuantity: result.data.totalQuantity } }));
    }
  })} type="button"><ShoppingCart aria-hidden="true" className="size-4" />{pending ? (ru ? "Добавляем..." : "Se adaugă...") : (ru ? "В корзину" : "În coș")}</button><p aria-live="polite" className="public-catalog-cart-message">{message}</p></div>;
}
