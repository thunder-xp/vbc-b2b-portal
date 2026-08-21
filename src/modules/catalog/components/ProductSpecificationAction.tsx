"use client";

import { ClipboardList, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import {
  addCatalogProductToEstimateAction,
  listEditableEstimatesForProductAction,
} from "../../estimates/actions/estimate.actions";
import { getCatalogCopy, usePartnerLocale } from "../../partner-locale";
import { IconActionTooltip } from "../../platform-ui";

export function ProductSpecificationAction({
  compact = false,
  productId,
}: {
  compact?: boolean;
  productId: string;
}) {
  const copy = getCatalogCopy(usePartnerLocale());
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<
    Array<{
      id: string;
      name: string;
      estimateNumber: string;
      revision: number;
    }>
  >([]);
  const [estimateId, setEstimateId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!drafts.length)
      startTransition(async () => {
        const result = await listEditableEstimatesForProductAction();
        if (!result.success) {
          setMessage(copy.estimateLoadFailed);
          return;
        }
        setDrafts(result.data);
        setEstimateId(result.data[0]?.id ?? "");
      });
  };

  const triggerClass = `inline-flex items-center justify-center gap-2 rounded-md border text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${open ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`;
  return (
    <div className="relative">
      {compact ? (
        <IconActionTooltip label={copy.addToEstimate}>
          <button
            aria-label={copy.addToEstimate}
            aria-expanded={open}
            className={`${triggerClass} size-11`}
            onClick={toggle}
            type="button"
          >
            <ClipboardList aria-hidden="true" className="size-4" />
          </button>
        </IconActionTooltip>
      ) : (
        <button
          aria-expanded={open}
          className={`${triggerClass} h-11 px-3`}
          onClick={toggle}
          type="button"
        >
          <ClipboardList aria-hidden="true" className="size-4" />
          {copy.toEstimate}
        </button>
      )}
      {open ? (
        <div
          className={`absolute z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-zinc-200 bg-white p-4 shadow-lg ${compact ? "right-0" : "left-0"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-950">
              {copy.addToEstimate}
            </p>
            <IconActionTooltip label={copy.close}>
              <button
                aria-label={copy.close}
                className="inline-flex size-9 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </IconActionTooltip>
          </div>
          {drafts.length ? (
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-zinc-700">
                {copy.estimate}
                <select
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  onChange={(event) => setEstimateId(event.target.value)}
                  value={estimateId}
                >
                  {drafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.estimateNumber} · {draft.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-zinc-700">
                {copy.quantity}
                <input
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  max={9999}
                  min={1}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  type="number"
                  value={quantity}
                />
              </label>
              <button
                className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={
                  pending ||
                  !estimateId ||
                  !Number.isInteger(quantity) ||
                  quantity < 1 ||
                  quantity > 9999
                }
                onClick={() =>
                  startTransition(async () => {
                    const result = await addCatalogProductToEstimateAction({
                      estimateId,
                      productId,
                      quantity,
                      requestKey: crypto.randomUUID(),
                    });
                    setMessage(
                      result.success
                        ? copy.estimateProductAdded
                        : result.message,
                    );
                    if (result.success) setOpen(false);
                  })
                }
                type="button"
              >
                {copy.add}
              </button>
              <Link
                className="flex min-h-11 items-center justify-center rounded-md border border-zinc-300 text-sm font-semibold text-zinc-800"
                href={`/cabinet/estimates/new?productId=${encodeURIComponent(productId)}`}
                prefetch={false}
              >
                {copy.createEstimate}
              </Link>
            </div>
          ) : !pending ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-zinc-600">{copy.noEstimates}</p>
              <Link
                className="flex min-h-11 items-center justify-center rounded-md border border-zinc-300 text-sm font-semibold text-zinc-800"
                href={`/cabinet/estimates/new?productId=${encodeURIComponent(productId)}`}
                prefetch={false}
              >
                {copy.createEstimate}
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">{copy.loading}</p>
          )}
        </div>
      ) : null}
      {message ? (
        <p
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-white shadow-lg"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
