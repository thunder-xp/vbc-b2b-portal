"use client";

import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { addToCartAction } from "../actions/cart.actions";

export function AddToCartButton({ productId }: { productId: string }) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <div className="space-y-1.5">
    <div className="flex flex-wrap gap-2">
    <label className="grid gap-1 text-xs font-medium text-zinc-600">Количество
      <input aria-label="Количество товара" className="h-11 w-24 rounded-md border border-zinc-300 px-3 text-center text-sm" max={9999} min={1} onChange={(event) => setQuantity(normalizeQuantity(event.target.valueAsNumber))} type="number" value={quantity} />
    </label>
    <button className="mt-auto inline-flex h-11 items-center gap-2 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60" disabled={pending} onClick={() => startTransition(async () => {
      const result = await addToCartAction(productId, quantity);
      setMessage(result.message);
      if (result.success) {
        recordBehaviorInteraction({ eventName: "product_added_to_cart", productId, quantity, route: "/cabinet/catalog/product", sourceSurface: "product_detail" });
        router.refresh();
      }
    })} type="button"><ShoppingCart aria-hidden="true" className="size-4" />{pending ? "Добавление..." : "Добавить в корзину"}</button>
    </div>
    {message && <p aria-live="polite" className="text-xs font-medium text-emerald-700">{message}</p>}
  </div>;
}

function normalizeQuantity(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 9999 ? value : 1;
}
