"use client";

import { ListPlus } from "lucide-react";
import { useState } from "react";

import type { BehaviorEventName } from "../../behavior-analytics/types";
import { getCatalogCopy, usePartnerLocale } from "../../partner-locale";
import { emitLiveCommerceSelectionAdd, type LiveCommerceSelectionProduct } from "../services/live-commerce-selection";

export function CatalogQuantityCartAction({
  initialQuantity = 1,
  productId,
  selectionProduct,
  sourceSurface = "product_card",
  successEventName,
  onSuccess,
}: {
  initialQuantity?: number;
  productId: string;
  selectionProduct: LiveCommerceSelectionProduct;
  sourceSurface?: string;
  successEventName?: BehaviorEventName;
  onSuccess?: () => void;
}) {
  const locale = usePartnerLocale();
  const copy = getCatalogCopy(locale);
  const [quantityInput, setQuantityInput] = useState(String(initialQuantity));
  const [feedback, setFeedback] = useState<{
    message: string;
    success: boolean;
  } | null>(null);
  const quantity = Number(quantityInput);
  const quantityError = validateQuantity(quantityInput, copy);
  const feedbackId = `catalog-cart-feedback-${productId}`;

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
        <label className="sr-only" htmlFor={`catalog-quantity-${productId}`}>
          {copy.quantity}
        </label>
        <input
          aria-describedby={feedbackId}
          aria-invalid={Boolean(quantityError)}
          aria-label={copy.productQuantity}
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
          aria-label={getQuickSelectionLabel(locale)}
          className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-emerald-700 px-2 text-sm font-semibold leading-tight text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60"
          disabled={Boolean(quantityError)}
          onClick={() => {
            if (quantityError) return;
            emitLiveCommerceSelectionAdd({ product: selectionProduct, quantity });
            setFeedback({ message: `${locale === "ro" ? "Adăugat" : "Добавлено"}: ${quantity} ${locale === "ro" ? "buc." : "шт."}`, success: true });
            void sourceSurface;
            void successEventName;
            onSuccess?.();
          }}
          type="button"
        >
          <ListPlus aria-hidden="true" className="size-4 shrink-0" />
          <span className="whitespace-nowrap">
            {getQuickSelectionLabel(locale)}
          </span>
        </button>
      </div>
      <p
        aria-live="polite"
        className={`min-h-4 text-xs font-medium ${quantityError || feedback?.success === false ? "text-red-700" : "text-emerald-700"}`}
        id={feedbackId}
      >
        {quantityError ?? feedback?.message ?? ""}
      </p>
    </div>
  );
}

function getQuickSelectionLabel(locale: "ru" | "ro"): string {
  return locale === "ro" ? "În selecție" : "В подборку";
}

function validateQuantity(
  value: string,
  copy: ReturnType<typeof getCatalogCopy>,
): string | null {
  if (!value.trim()) return copy.quantityRequired;
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 9999
    ? null
    : copy.quantityRange;
}
