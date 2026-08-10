"use client";

import { ChevronDown, Heart } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";

import { setFavoriteProductAction } from "../actions";
import { IconActionTooltip } from "../../platform-ui";

const PurchasingListChooserDialog = dynamic(
  () => import("./PurchasingListChooserDialog").then((module) => module.PurchasingListChooserDialog),
  { ssr: false },
);

export function FavoriteProductButton({ compact = false, initialSaved, productId, withListChooser = false }: { compact?: boolean; initialSaved: boolean; productId: string; withListChooser?: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = saved ? "Удалить из избранного" : "Добавить в избранное";

  const favoriteControl = <button
    aria-label={label}
    aria-pressed={saved}
    className={`inline-flex items-center justify-center gap-2 border text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60 ${withListChooser ? "rounded-l-md" : "rounded-md"} ${compact ? "size-11 p-0" : "h-11 px-3"} ${saved ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-400"}`}
    disabled={pending}
    onClick={() => {
      const next = !saved;
      setSaved(next);
      startTransition(async () => {
        const result = await setFavoriteProductAction(productId, next);
        if (!result.success) {
          setSaved(!next);
          setMessage("Не удалось обновить избранное. Повторите попытку.");
        } else {
          setSaved(result.data.saved);
          setMessage(result.data.saved ? "Товар добавлен в избранное." : "Товар удалён из избранного.");
        }
      });
    }}
    type="button"
  ><Heart aria-hidden="true" className={`size-4 ${saved ? "fill-current" : ""}`} />{compact ? null : (saved ? "В избранном" : "В избранное")}</button>;
  const favoriteButton = compact ? <IconActionTooltip label={label}>{favoriteControl}</IconActionTooltip> : favoriteControl;

  if (!withListChooser) return <div>{favoriteButton}{message ? <p aria-live="polite" className={compact ? "sr-only" : "mt-1 text-xs text-zinc-600"}>{message}</p> : null}</div>;

  return <>
    <div aria-label="Избранное и списки" className="inline-flex">
      {favoriteButton}
      <IconActionTooltip label="Добавить в другой список"><button
        aria-label="Добавить в другой список"
        className="ml-px inline-flex h-11 w-8 items-center justify-center rounded-r-md border border-zinc-300 bg-white text-zinc-700 outline-none hover:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        onClick={() => setChooserOpen(true)}
        type="button"
      >
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </button></IconActionTooltip>
    </div>
    {message ? <p aria-live="polite" className={compact ? "fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-white shadow-lg" : "mt-1 text-xs text-zinc-600"}>{message}</p> : null}
    {chooserOpen ? <PurchasingListChooserDialog onClose={() => setChooserOpen(false)} productId={productId} /> : null}
  </>;
}
