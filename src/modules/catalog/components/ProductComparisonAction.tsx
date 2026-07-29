"use client";

import { Columns3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
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
      setMessage(`Можно сравнить не более ${COMPARISON_LIMIT} товаров.`);
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
    setMessage(
      added
        ? "Товар добавлен к сравнению."
        : "Товар удалён из сравнения.",
    );
    recordBehaviorInteraction({
      eventName: added ? "product_added_to_compare" : "product_removed_from_compare",
      productId,
      route: "/cabinet/catalog",
      sourceSurface: "product_card",
    });
  };
  const label = selected ? "В сравнении" : "В сравнение";

  return (
    <div className="space-y-1">
      <button
        aria-describedby={`compare-count-${productId}`}
        aria-label={label}
        aria-pressed={selected}
        className={`inline-flex items-center justify-center gap-2 rounded-md border text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${selected ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"} ${compact ? "size-11 p-0" : "h-11 px-3"}`}
        onClick={toggle}
        title={compact ? `${label} (${ids.length}/${COMPARISON_LIMIT})` : undefined}
        type="button"
      >
        <Columns3 aria-hidden="true" className="size-4" />
        {compact ? null : label}
      </button>
      <span className="sr-only" id={`compare-count-${productId}`}>
        Выбрано: {ids.length} из {COMPARISON_LIMIT}
      </span>
      {!compact && ids.length ? (
        <Link
          className="block text-xs font-medium text-emerald-700"
          href="/cabinet/compare"
          prefetch={false}
        >
          Сравнить ({ids.length})
        </Link>
      ) : null}
      {message ? (
        <p
          aria-live="polite"
          className={compact
            ? "fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-white shadow-lg"
            : "text-xs text-zinc-600"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export { comparisonStorageKey, readComparisonIds } from "./comparison-storage";
