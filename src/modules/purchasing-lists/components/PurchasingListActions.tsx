"use client";

import { Archive, Copy, RotateCcw, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addPurchasingListToCartAction,
  createEstimateFromPurchasingListAction,
  duplicatePurchasingListAction,
  setPurchasingListArchivedAction,
} from "../actions";
import { procurementCopy, usePartnerLocale } from "../../partner-locale";

export function PurchasingListActions({
  listId,
  name,
  revision,
  archived,
  canManage,
  isSystemFavorites = false,
}: {
  listId: string;
  name: string;
  revision: number;
  archived: boolean;
  canManage: boolean;
  isSystemFavorites?: boolean;
}) {
  const router = useRouter();
  const copy = procurementCopy(usePartnerLocale());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [cartRequestKey, setCartRequestKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [estimateRequestKey, setEstimateRequestKey] = useState(() =>
    crypto.randomUUID(),
  );
  const run = (
    operation: () => Promise<{
      success: boolean;
      message: string;
      data: unknown;
    }>,
    destination?: (data: unknown) => string,
    onSuccess?: () => void,
  ) =>
    startTransition(async () => {
      const result = await operation();
      setMessage(result.success ? copy.operationComplete : copy.operationError);
      if (result.success) onSuccess?.();
      if (result.success && destination) router.push(destination(result.data));
      else router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      {!archived ? (
        <button
          aria-label={copy.addListToCart}
          className="icon-action"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                addPurchasingListToCartAction({
                  listId,
                  requestKey: cartRequestKey,
                }),
              undefined,
              () => setCartRequestKey(crypto.randomUUID()),
            )
          }
          title={copy.addToCart}
          type="button"
        >
          <ShoppingCart className="size-4" />
        </button>
      ) : null}
      {!archived ? (
        <button
          className="text-action"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                createEstimateFromPurchasingListAction({
                  listId,
                  name: `${copy.estimatePrefix} — ${name}`,
                  requestKey: estimateRequestKey,
                }),
              (data) =>
                `/cabinet/estimates/${(data as { estimateId: string }).estimateId}`,
              () => setEstimateRequestKey(crypto.randomUUID()),
            )
          }
          type="button"
        >
          {copy.createEstimate}
        </button>
      ) : null}
      {canManage ? (
        <button
          aria-label={copy.duplicateList}
          className="icon-action"
          disabled={pending}
          onClick={() =>
            run(
              () => duplicatePurchasingListAction(listId),
              (data) =>
                `/cabinet/purchasing-lists/${(data as { id: string }).id}`,
            )
          }
          title={copy.duplicate}
          type="button"
        >
          <Copy className="size-4" />
        </button>
      ) : null}
      {canManage && !isSystemFavorites ? (
        <button
          aria-label={archived ? copy.restoreList : copy.archiveList}
          className="icon-action"
          disabled={pending}
          onClick={() =>
            run(() =>
              setPurchasingListArchivedAction(listId, revision, !archived),
            )
          }
          title={archived ? copy.restore : copy.archiveAction}
          type="button"
        >
          {archived ? (
            <RotateCcw className="size-4" />
          ) : (
            <Archive className="size-4" />
          )}
        </button>
      ) : null}
      {message ? (
        <span className="w-full text-xs text-zinc-600" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
