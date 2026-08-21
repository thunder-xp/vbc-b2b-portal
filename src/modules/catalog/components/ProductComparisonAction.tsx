"use client";

import { Columns3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { getCatalogCopy, usePartnerLocale } from "../../partner-locale";
import { IconActionTooltip } from "../../platform-ui";
import {
  COMPARISON_CHANGED_EVENT,
  COMPARISON_LIMIT,
  comparisonStorageKey,
  readComparisonIds,
  writeComparisonIds,
} from "./comparison-storage";

type ProductComparisonActionProps = {
  categoryId: string | null;
  companyId: string;
  compact?: boolean;
  productId: string;
  userId: string;
};

export function ProductComparisonAction({
  companyId,
  compact = false,
  productId,
  userId,
}: ProductComparisonActionProps) {
  const copy = getCatalogCopy(usePartnerLocale());
  const [ids, setIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const key = comparisonStorageKey(companyId, userId);
    const sync = (event?: Event) => {
      if (event instanceof StorageEvent && event.key !== key) return;
      if (event instanceof CustomEvent && event.detail?.key !== key) return;
      setIds(readComparisonIds(companyId, userId));
    };
    const frame = requestAnimationFrame(() => sync());
    window.addEventListener("storage", sync);
    window.addEventListener(COMPARISON_CHANGED_EVENT, sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("storage", sync);
      window.removeEventListener(COMPARISON_CHANGED_EVENT, sync);
    };
  }, [companyId, userId]);

  const selected = ids.includes(productId);
  const toggle = () => {
    const current = readComparisonIds(companyId, userId);
    if (!current.includes(productId) && current.length >= COMPARISON_LIMIT) {
      setMessage(`${copy.compareLimit} ${COMPARISON_LIMIT} ${copy.compareProducts}.`);
      return;
    }
    const next = writeComparisonIds(
      companyId,
      userId,
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
    const added = next.includes(productId);
    setMessage(added ? copy.compareAdded : copy.compareRemoved);
    recordBehaviorInteraction({
      eventName: added
        ? "product_added_to_compare"
        : "product_removed_from_compare",
      productId,
      route: "/cabinet/catalog",
      sourceSurface: "product_card",
    });
  };
  const label = selected ? copy.compareSelected : copy.compareAdd;

  return (
    <div className="space-y-1">
      {compact ? (
        <IconActionTooltip
          label={`${label} (${ids.length}/${COMPARISON_LIMIT})`}
        >
          <button
            aria-describedby={`compare-count-${productId}`}
            aria-label={label}
            aria-pressed={selected}
            className={`inline-flex items-center justify-center gap-2 rounded-md border text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${selected ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"} size-11 p-0`}
            onClick={toggle}
            type="button"
          >
            <Columns3 aria-hidden="true" className="size-4" />
          </button>
        </IconActionTooltip>
      ) : (
        <button
          aria-describedby={`compare-count-${productId}`}
          aria-label={label}
          aria-pressed={selected}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${selected ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}
          onClick={toggle}
          type="button"
        >
          <Columns3 aria-hidden="true" className="size-4" />
          {label}
        </button>
      )}
      <span className="sr-only" id={`compare-count-${productId}`}>
        {copy.compareChosen}: {ids.length} / {COMPARISON_LIMIT}
      </span>
      {!compact && ids.length ? (
        <Link
          className="block text-xs font-medium text-emerald-700"
          href="/cabinet/compare"
          prefetch={false}
        >
          {copy.compare} ({ids.length})
        </Link>
      ) : null}
      {message ? (
        <p
          aria-live="polite"
          className={
            compact
              ? "fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-white shadow-lg"
              : "text-xs text-zinc-600"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export { comparisonStorageKey, readComparisonIds } from "./comparison-storage";
