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

const initial: ActionResult<null> = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};

export function CartItemActions({
  itemId,
  quantity,
}: {
  itemId: string;
  quantity: number;
}) {
  const [draft, setDraft] = useState(quantity);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const draftRef = useRef(quantity);
  const confirmedRef = useRef(quantity);
  const pendingRef = useRef<Promise<boolean> | null>(null);
  const router = useRouter();
  const {
    registerLineFlusher,
    trackMutation,
  } = useCartCheckoutCoordinator();

  const setVisibleQuantity = useCallback((next: number) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const persist = useCallback(async (requested?: number): Promise<boolean> => {
    if (requested !== undefined) setVisibleQuantity(requested);

    if (pendingRef.current) {
      const activeMutation = pendingRef.current;
      await activeMutation;
      if (pendingRef.current === activeMutation) pendingRef.current = null;
    }

    const next = draftRef.current;
    if (!Number.isInteger(next) || next < 1 || next > 9999) {
      setMessage("Укажите целое количество от 1 до 9999.");
      return false;
    }
    if (next === confirmedRef.current) return true;

    setPending(true);
    setMessage("Сохраняем изменения корзины…");
    const operation = (async () => {
      const formData = new FormData();
      formData.set("itemId", itemId);
      formData.set("quantity", String(next));
      const result = await updateCartItemAction(initial, formData);
      if (!result.success) {
        setMessage(
          result.message
          || "Не удалось сохранить количество. Проверьте значение и повторите попытку.",
        );
        return false;
      }
      confirmedRef.current = next;
      setMessage(`Количество сохранено: ${next} шт.`);
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
  }, [itemId, router, setVisibleQuantity, trackMutation]);

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
    setMessage("Удаляем товар…");
    const operation = (async () => {
      const formData = new FormData();
      formData.set("itemId", itemId);
      const result = await removeCartItemAction(initial, formData);
      setMessage(
        result.message
        || (result.success
          ? "Товар удалён."
          : "Не удалось удалить товар. Повторите попытку."),
      );
      if (result.success) {
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
    <div className="space-y-2">
      <div className="flex items-end gap-1.5">
        <button
          aria-label="Уменьшить количество"
          className="inline-flex size-11 items-center justify-center rounded-md border border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || draft <= 1}
          onClick={() => void persist(draftRef.current - 1)}
          type="button"
        >
          <Minus aria-hidden="true" className="size-4" />
        </button>
        <label className="text-xs text-zinc-600">
          Количество
          <input
            aria-describedby={`${itemId}-quantity-status`}
            aria-invalid={!Number.isInteger(draft) || draft < 1 || draft > 9999}
            aria-label="Количество товара"
            className="mt-1 block h-11 w-20 rounded-md border border-zinc-300 px-2 text-center text-sm"
            disabled={pending}
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
        </label>
        <button
          aria-label="Увеличить количество"
          className="inline-flex size-11 items-center justify-center rounded-md border border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || draft >= 9999}
          onClick={() => void persist(draftRef.current + 1)}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>
      <button
        className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
        disabled={pending}
        onClick={() => void remove()}
        type="button"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Удалить
      </button>
      <p
        aria-live="polite"
        className="min-h-4 text-xs text-zinc-500"
        id={`${itemId}-quantity-status`}
      >
        {message}
      </p>
    </div>
  );
}
