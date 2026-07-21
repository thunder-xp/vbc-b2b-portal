"use client";

import { Heart } from "lucide-react";
import { useState, useTransition } from "react";

import { setFavoriteProductAction } from "../actions";

export function FavoriteProductButton({ compact = false, initialSaved, productId }: { compact?: boolean; initialSaved: boolean; productId: string }) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  const label = saved ? "Удалить из избранного" : "Добавить в избранное";

  return <button
    aria-label={label}
    aria-pressed={saved}
    className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition disabled:opacity-60 ${compact ? "size-9 p-0" : "px-3"} ${saved ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-400"}`}
    disabled={pending}
    onClick={() => {
      const next = !saved;
      setSaved(next);
      startTransition(async () => {
        const result = await setFavoriteProductAction(productId, next);
        if (!result.success) setSaved(!next);
        else setSaved(result.data.saved);
      });
    }}
    title={compact ? label : undefined}
    type="button"
  ><Heart aria-hidden="true" className={`size-4 ${saved ? "fill-current" : ""}`} />{compact ? null : (saved ? "В избранном" : "В избранное")}</button>;
}
