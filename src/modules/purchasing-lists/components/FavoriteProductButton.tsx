"use client";

import { ChevronDown, Heart } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";

import { setFavoriteProductAction } from "../actions";

const PurchasingListChooserDialog = dynamic(
  () => import("./PurchasingListChooserDialog").then((module) => module.PurchasingListChooserDialog),
  { ssr: false },
);

export function FavoriteProductButton({ compact = false, initialSaved, productId, withListChooser = false }: { compact?: boolean; initialSaved: boolean; productId: string; withListChooser?: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = saved ? "Удалить из избранного" : "Добавить в избранное";

  const favoriteButton = <button
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

  if (!withListChooser) return favoriteButton;

  return <>
    <div aria-label="Избранное и списки" className="inline-flex">
      {favoriteButton}
      <button
        aria-label="Добавить в другой список"
        className="ml-px inline-flex h-9 w-7 items-center justify-center rounded-r-md border border-zinc-300 bg-white text-zinc-700 hover:border-emerald-400"
        onClick={() => setChooserOpen(true)}
        title="Добавить в другой список"
        type="button"
      >
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </button>
    </div>
    {chooserOpen ? <PurchasingListChooserDialog onClose={() => setChooserOpen(false)} productId={productId} /> : null}
  </>;
}
