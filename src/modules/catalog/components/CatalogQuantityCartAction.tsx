"use client";

import { ShoppingCart } from "lucide-react";
import { useState, useTransition } from "react";

import { addToCartAction } from "../../orders/actions/cart.actions";

export function CatalogQuantityCartAction({ productId }: { productId: string }) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return <div className="flex min-w-0 items-center gap-1.5">
    <label className="sr-only" htmlFor={`catalog-quantity-${productId}`}>Количество</label>
    <input
      className="h-9 w-14 rounded-md border border-zinc-300 px-2 text-center text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200"
      id={`catalog-quantity-${productId}`}
      max={9999}
      min={1}
      onChange={(event) => setQuantity(normalizeQuantity(event.target.valueAsNumber))}
      type="number"
      value={quantity}
    />
    <button
      aria-label="Добавить в корзину"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const result = await addToCartAction(productId, quantity);
        setMessage(result.message);
      })}
      title="В корзину"
      type="button"
    >
      <ShoppingCart aria-hidden="true" className="size-4" />
    </button>
    {message ? <span aria-live="polite" className="sr-only">{message}</span> : null}
  </div>;
}

function normalizeQuantity(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 9999 ? value : 1;
}
