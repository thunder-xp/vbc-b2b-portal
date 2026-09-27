"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "../../access-control/actions/action-result";
import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import {
  removeCartItemAction,
  updateCartItemAction,
} from "../actions/cart.actions";
import { useCartCheckoutCoordinator } from "./CartCheckoutCoordinator";
import { getOrdersCopy, usePartnerLocale } from "../../partner-locale";
import { notifyAuthoritativeCartCount } from "./cart-badge-events";

const initial: ActionResult<number> = {
  success: true,
  errorCode: null,
  message: "",
  data: 0,
};

export function CartItemActions({
  itemId,
  quantity,
  locked = false,
}: {
  itemId: string;
  quantity: number;
  locked?: boolean;
}) {
  const [draft, setDraft] = useState(quantity);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const draftRef = useRef(quantity);
  const confirmedRef = useRef(quantity);
  const pendingRef = useRef<Promise<boolean> | null>(null);
  const router = useRouter();
  const copy = getOrdersCopy(usePartnerLocale());
  const { registerLineFlusher, trackMutation } = useCartCheckoutCoordinator();

  const setVisibleQuantity = useCallback((next: number) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const persist = useCallback(
    async (requested?: number): Promise<boolean> => {
      if (requested !== undefined) setVisibleQuantity(requested);

      if (pendingRef.current) {
        const activeMutation = pendingRef.current;
        await activeMutation;
        if (pendingRef.current === activeMutation) pendingRef.current = null;
      }

      const next = draftRef.current;
      if (!Number.isInteger(next) || next < 1 || next > 9999) {
        setMessage(copy.quantityRange);
        return false;
      }
      if (next === confirmedRef.current) return true;

      setPending(true);
      setMessage(copy.savingCart);
      const operation = (async () => {
        const formData = new FormData();
        formData.set("itemId", itemId);
        formData.set("quantity", String(next));
        const result = await updateCartItemAction(initial, formData);
        if (!result.success) {
          setMessage(reconciliationMessage(result, copy) ?? copy.quantitySaveError);
          return false;
        }
        confirmedRef.current = next;
        notifyAuthoritativeCartCount(result.data);
        setMessage(`${copy.quantitySaved}: ${next} ${copy.units}`);
        recordBehaviorInteraction({
          eventName: "cart_quantity_changed",
          quantity: next,
          route: "/cabinet/cart",
          sourceSurface: "cart",
        });
        router.refresh();
        return true;
      })();

      const trackedMutation = trackMutation(operation);
      pendingRef.current = trackedMutation;
      try {
        return await trackedMutation;
      } finally {
        if (pendingRef.current === trackedMutation) {
          pendingRef.current = null;
          setPending(false);
        }
      }
    },
    [copy, itemId, router, setVisibleQuantity, trackMutation],
  );

  useEffect(
    () => registerLineFlusher(itemId, () => persist(draftRef.current)),
    [itemId, persist, registerLineFlusher],
  );

  useEffect(() => {
    if (!pendingRef.current && draftRef.current === confirmedRef.current) {
      confirmedRef.current = quantity;
      setVisibleQuantity(quantity);
    }
  }, [quantity, setVisibleQuantity]);

  const remove = async () => {
    if (pendingRef.current) await pendingRef.current;
    setPending(true);
    setMessage(copy.removingProduct);
    const operation = (async () => {
      const formData = new FormData();
      formData.set("itemId", itemId);
      const result = await removeCartItemAction(initial, formData);
      setMessage(
        result.success
          ? copy.productRemoved
          : (reconciliationMessage(result, copy) ?? copy.removeProductError),
      );
      if (result.success) {
        notifyAuthoritativeCartCount(result.data);
        recordBehaviorInteraction({
          eventName: "product_removed_from_cart",
          route: "/cabinet/cart",
          sourceSurface: "cart",
        });
        router.refresh();
      }
      return result.success;
    })();
    try {
      await trackMutation(operation);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2 md:col-span-1 md:justify-start">
      <div className="flex shrink-0 items-center gap-1">
        <button
          aria-label={copy.decreaseQuantity}
          className="inline-flex size-10 items-center justify-center rounded-md border border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={locked || pending || draft <= 1}
          onClick={() => void persist(draftRef.current - 1)}
          type="button"
        >
          <Minus aria-hidden="true" className="size-4" />
        </button>
        <div>
          <input
            aria-describedby={`${itemId}-quantity-status`}
            aria-invalid={!Number.isInteger(draft) || draft < 1 || draft > 9999}
            aria-label={copy.productQuantity}
            className="block h-10 w-16 rounded-md border border-zinc-300 px-2 text-center text-sm"
            disabled={locked || pending}
            max={9999}
            min={1}
            onBlur={() => void persist()}
            onChange={(event) => setVisibleQuantity(event.target.valueAsNumber)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void persist();
              }
            }}
            type="number"
            value={Number.isNaN(draft) ? "" : draft}
          />
        </div>
        <button
          aria-label={copy.increaseQuantity}
          className="inline-flex size-10 items-center justify-center rounded-md border border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={locked || pending || draft >= 9999}
          onClick={() => void persist(draftRef.current + 1)}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>
      <button
        aria-label={copy.remove}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"
        disabled={locked || pending}
        onClick={() => void remove()}
        title={copy.remove}
        type="button"
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
      {message ? <p
        aria-live="polite"
        className="basis-full text-right text-xs text-zinc-500 md:text-left"
        id={`${itemId}-quantity-status`}
      >
        {message}
      </p> : <p aria-live="polite" className="sr-only" id={`${itemId}-quantity-status`} />}
    </div>
  );
}

function reconciliationMessage(
  result: ActionResult<number>,
  copy: ReturnType<typeof getOrdersCopy>,
): string | null {
  if (result.success) return null;
  if (result.errorCode === "CART_RECONCILIATION_LOCKED") {
    return copy.cartReconciliationLocked;
  }
  if (result.errorCode === "CART_RECONCILIATION_STALE") {
    return result.message
      ? `${copy.cartReconciliationStale} ${copy.correlationCode}: ${result.message}.`
      : copy.cartReconciliationStale;
  }
  return null;
}
