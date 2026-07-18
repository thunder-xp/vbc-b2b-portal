"use client";

import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addToCartAction } from "../actions/cart.actions";

export function AddToCartButton({ productId }: { productId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <div className="space-y-1">
    <button className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60" disabled={pending} onClick={() => startTransition(async () => {
      const result = await addToCartAction(productId, 1);
      setMessage(result.message);
      if (result.success) router.refresh();
    })} type="button"><ShoppingCart aria-hidden="true" className="size-4" />{pending ? "Добавление..." : "В корзину"}</button>
    {message && <p aria-live="polite" className="text-xs text-zinc-600">{message}</p>}
  </div>;
}
