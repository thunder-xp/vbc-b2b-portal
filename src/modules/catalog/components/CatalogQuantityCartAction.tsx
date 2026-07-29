"use client";

import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { addToCartAction } from "../../orders/actions/cart.actions";

export function CatalogQuantityCartAction({ productId }: { productId: string }) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return <div className="min-w-0 space-y-1.5">
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
    <label className="sr-only" htmlFor={`catalog-quantity-${productId}`}>Количество</label>
    <input
      aria-label="Количество товара"
      className="h-11 w-full rounded-md border border-zinc-300 px-2 text-center text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200"
      id={`catalog-quantity-${productId}`}
      max={9999}
      min={1}
      onChange={(event) => setQuantity(normalizeQuantity(event.target.valueAsNumber))}
      type="number"
      value={quantity}
    />
    <button
      aria-label="Добавить в корзину"
      className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const result = await addToCartAction(productId, quantity);
        setMessage(result.message);
        if (result.success) {
          recordBehaviorInteraction({ eventName: "product_added_to_cart", productId, quantity, route: "/cabinet/catalog", sourceSurface: "product_card" });
          router.refresh();
        }
      })}
      type="button"
    >
      <ShoppingCart aria-hidden="true" className="size-4" />
      <span>{pending ? "Добавление..." : "Добавить в корзину"}</span>
    </button>
    </div>
    {message ? <p aria-live="polite" className="min-h-4 text-xs font-medium text-emerald-700">{message}</p> : <div className="min-h-4" aria-hidden="true" />}
  </div>;
}

function normalizeQuantity(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 9999 ? value : 1;
}
