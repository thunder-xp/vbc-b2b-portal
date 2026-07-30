"use client";

import { ShoppingCart } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import type { BehaviorEventName } from "../../behavior-analytics/types";
import { addToCartAction } from "../../orders/actions/cart.actions";

export function CatalogQuantityCartAction({
  productId,
  sourceSurface = "product_card",
  successEventName,
}: {
  productId: string;
  sourceSurface?: string;
  successEventName?: BehaviorEventName;
}) {
  const [quantityInput, setQuantityInput] = useState("1");
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const submissionInFlight = useRef(false);
  const quantity = Number(quantityInput);
  const quantityError = validateQuantity(quantityInput);
  const feedbackId = `catalog-cart-feedback-${productId}`;

  return <div className="min-w-0 space-y-1.5">
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
      <label className="sr-only" htmlFor={`catalog-quantity-${productId}`}>Количество</label>
      <input
        aria-describedby={feedbackId}
        aria-invalid={Boolean(quantityError)}
        aria-label="Количество товара"
        className="h-11 w-full rounded-md border border-zinc-300 px-2 text-center text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200"
        id={`catalog-quantity-${productId}`}
        inputMode="numeric"
        max={9999}
        min={1}
        onChange={(event) => {
          setQuantityInput(event.target.value);
          setFeedback(null);
        }}
        step={1}
        type="number"
        value={quantityInput}
      />
      <button
        aria-label="Добавить в корзину"
        className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-emerald-700 px-2 text-sm font-semibold leading-tight text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60"
        disabled={pending || Boolean(quantityError)}
        onClick={() => {
          if (submissionInFlight.current || quantityError) return;
          submissionInFlight.current = true;
          startTransition(async () => {
            try {
              const result = await addToCartAction(productId, quantity);
              setFeedback({
                message: result.success ? `Добавлено в корзину: ${quantity} шт.` : result.message,
                success: result.success,
              });
              if (result.success) {
                recordBehaviorInteraction({ eventName: "product_added_to_cart", productId, quantity, route: "/cabinet/catalog", sourceSurface });
                if (successEventName && successEventName !== "product_added_to_cart") {
                  recordBehaviorInteraction({ eventName: successEventName, productId, quantity, route: "/cabinet", sourceSurface });
                }
                window.dispatchEvent(new CustomEvent("novotech:cart-updated", { detail: { quantityAdded: quantity } }));
              }
            } catch {
              setFeedback({ message: "Не удалось добавить товар. Корзина сохранена — повторите попытку.", success: false });
            } finally {
              submissionInFlight.current = false;
            }
          });
        }}
        type="button"
      >
        <ShoppingCart aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{pending ? "Добавление..." : "Добавить в корзину"}</span>
      </button>
    </div>
    <p aria-live="polite" className={`min-h-4 text-xs font-medium ${quantityError || feedback?.success === false ? "text-red-700" : "text-emerald-700"}`} id={feedbackId}>
      {quantityError ?? feedback?.message ?? ""}
    </p>
  </div>;
}

function validateQuantity(value: string): string | null {
  if (!value.trim()) return "Укажите количество.";
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 9999
    ? null
    : "Введите целое количество от 1 до 9999.";
}
