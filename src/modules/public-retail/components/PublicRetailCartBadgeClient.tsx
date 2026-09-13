"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { PublicRetailLocale } from "../types";

export const PUBLIC_RETAIL_CART_UPDATED_EVENT = "public-retail-cart-updated";

export function PublicRetailCartBadgeClient({ initialQuantity, locale, deferSummary = false }: { initialQuantity: number; locale: PublicRetailLocale; deferSummary?: boolean }) {
  const [quantity, setQuantity] = useState(initialQuantity);
  useEffect(() => {
    if (!deferSummary) return;
    const controller = new AbortController();
    void fetch("/api/public-retail/cart-summary", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    }).then(async (response) => response.ok ? response.json() as Promise<{ totalQuantity?: unknown }> : null)
      .then((summary) => {
        if (summary && Number.isInteger(summary.totalQuantity) && Number(summary.totalQuantity) >= 0) {
          setQuantity(Number(summary.totalQuantity));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [deferSummary]);
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<{ totalQuantity?: unknown }>).detail?.totalQuantity;
      if (Number.isInteger(next) && Number(next) >= 0) setQuantity(Number(next));
    };
    window.addEventListener(PUBLIC_RETAIL_CART_UPDATED_EVENT, update);
    return () => window.removeEventListener(PUBLIC_RETAIL_CART_UPDATED_EVENT, update);
  }, []);

  const label = locale === "ro" ? "Coș" : "Корзина";
  return <Link aria-label={`${label}: ${quantity}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm border border-zinc-300 bg-zinc-50 px-2 text-sm font-semibold text-zinc-800 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:gap-2 sm:px-3" href={`/cart?lang=${locale}`} prefetch={quantity > 0 ? undefined : false}><ShoppingCart aria-hidden="true" className="size-4" /><span>{label}</span>{quantity > 0 ? <span className="min-w-5 rounded-full bg-blue-700 px-1.5 text-center text-[10px] font-bold leading-5 text-white">{quantity > 99 ? "99+" : quantity}</span> : null}</Link>;
}
