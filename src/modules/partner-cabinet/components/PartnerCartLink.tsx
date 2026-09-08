"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CART_UPDATED_EVENT } from "../../orders/components/cart-badge-events";

export function PartnerCartLink({
  cartLabel,
  initialCount,
  positionsLabel,
}: {
  cartLabel: string;
  initialCount: number;
  positionsLabel: string;
}) {
  const [eventCount, setEventCount] = useState<{ initialCount: number; value: number } | null>(null);
  const count = eventCount?.initialCount === initialCount ? eventCount.value : initialCount;

  useEffect(() => {
    const handleCartUpdated = (event: Event) => {
      const totalUnitCount = event instanceof CustomEvent && typeof event.detail?.totalUnitCount === "number"
        ? event.detail.totalUnitCount
        : Number.NaN;
      if (Number.isFinite(totalUnitCount) && totalUnitCount >= 0) {
        setEventCount({ initialCount, value: Math.trunc(totalUnitCount) });
      }
    };
    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdated);
    return () => window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdated);
  }, [initialCount]);

  return <Link aria-label={`${cartLabel}: ${count} ${positionsLabel}`} className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" data-header-control="cart" href="/cabinet/cart" prefetch={false}>
    <ShoppingCart aria-hidden="true" className="size-[19px]" />
    {count > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-700 px-1 text-center text-[11px] font-semibold leading-5 text-white">{count > 99 ? "99+" : count}</span> : null}
  </Link>;
}
