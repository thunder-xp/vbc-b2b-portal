"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function PartnerCartLink({
  cartLabel,
  initialCount,
  positionsLabel,
}: {
  cartLabel: string;
  initialCount: number;
  positionsLabel: string;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const handleCartUpdated = (event: Event) => {
      const added = event instanceof CustomEvent && typeof event.detail?.quantityAdded === "number"
        ? event.detail.quantityAdded
        : 0;
      if (Number.isFinite(added) && added > 0) setCount((current) => current + Math.trunc(added));
    };
    window.addEventListener("novotech:cart-updated", handleCartUpdated);
    return () => window.removeEventListener("novotech:cart-updated", handleCartUpdated);
  }, []);

  return <Link aria-label={`${cartLabel}: ${count} ${positionsLabel}`} className="relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href="/cabinet/cart" prefetch={false}>
    <ShoppingCart aria-hidden="true" className="size-[19px]" />
    {count > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-700 px-1 text-center text-[11px] font-semibold leading-5 text-white">{count > 99 ? "99+" : count}</span> : null}
  </Link>;
}
