"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { PublicRetailLocale } from "../types";

export const PUBLIC_RETAIL_CART_UPDATED_EVENT = "public-retail-cart-updated";

export function PublicRetailCartBadgeClient({ initialQuantity, locale }: { initialQuantity: number; locale: PublicRetailLocale }) {
  const [quantity, setQuantity] = useState(initialQuantity);
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<{ totalQuantity?: unknown }>).detail?.totalQuantity;
      if (Number.isInteger(next) && Number(next) >= 0) setQuantity(Number(next));
    };
    window.addEventListener(PUBLIC_RETAIL_CART_UPDATED_EVENT, update);
    return () => window.removeEventListener(PUBLIC_RETAIL_CART_UPDATED_EVENT, update);
  }, []);

  return <Link aria-label={`${locale === "ro" ? "Coș" : "Корзина"}: ${quantity}`} className="relative grid size-11 place-items-center text-zinc-700 hover:text-emerald-700" href={`/cart?lang=${locale}`}><ShoppingCart aria-hidden="true" className="size-5" />{quantity > 0 ? <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-emerald-700 px-1 text-center text-[10px] font-bold leading-4 text-white">{Math.min(quantity, 99)}</span> : null}</Link>;
}
