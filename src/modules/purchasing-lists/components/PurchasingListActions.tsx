"use client";

import { Archive, Copy, Pencil, RotateCcw, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addPurchasingListToCartAction,
  createEstimateFromPurchasingListAction,
  duplicatePurchasingListAction,
  setPurchasingListArchivedAction,
  updatePurchasingListMetadataAction,
} from "../actions";
import { getSavedKitCopy, procurementCopy, usePartnerLocale } from "../../partner-locale";

export function PurchasingListActions({
  listId,
  name,
  revision,
  archived,
  canManage,
  isSystemFavorites = false,
  description,
  visibility,
}: {
  listId: string;
  name: string;
  revision: number;
  archived: boolean;
  canManage: boolean;
  isSystemFavorites?: boolean;
  description?: string | null;
  visibility?: "private" | "company";
}) {
  const router = useRouter();
  const locale = usePartnerLocale();
  const copy = procurementCopy(locale);
  const kitCopy = getSavedKitCopy(locale);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nextName, setNextName] = useState(name);
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
      {canManage && !archived && !isSystemFavorites && visibility ? (
        <button
          aria-label={kitCopy.rename}
          className="icon-action"
          disabled={pending}
          onClick={() => setRenaming((value) => !value)}
          title={kitCopy.rename}
          type="button"
        >
          <Pencil className="size-4" />
        </button>
      ) : null}
      {canManage ? (
        <button
          aria-label={kitCopy.saveAsNew}
          className="icon-action"
          disabled={pending}
          onClick={() =>
            run(
              () => duplicatePurchasingListAction(listId),
              (data) =>
                `/cabinet/purchasing-lists/${(data as { id: string }).id}`,
            )
          }
          title={kitCopy.saveAsNew}
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
      {renaming && visibility ? <form className="flex w-full flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); run(() => updatePurchasingListMetadataAction(listId, revision, { name: nextName, description, visibility }), undefined, () => setRenaming(false)); }}>
        <input aria-label={kitCopy.rename} className="h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-sm" maxLength={120} onChange={(event) => setNextName(event.target.value)} value={nextName} />
        <button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={!nextName.trim() || pending} type="submit">{kitCopy.save}</button>
      </form> : null}
    </div>
  );
}
