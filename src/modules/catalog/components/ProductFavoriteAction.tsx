"use client";

import { Heart } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { getCatalogFavoriteStateAction, toggleCatalogFavoriteAction } from "../actions";

export function ProductFavoriteAction({ productId, slug }: { productId: string; slug: string }) {
  const [favorite, setFavorite] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => { let active = true; void getCatalogFavoriteStateAction(productId).then((result) => { if (active && result.success) setFavorite(result.data); }); return () => { active = false; }; }, [productId]);
  return <div className="space-y-1"><button aria-pressed={favorite} className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50" disabled={pending} onClick={() => startTransition(async () => { const result = await toggleCatalogFavoriteAction(productId, slug); if (result.success) setFavorite(result.data); setMessage(result.success ? result.message : "Не удалось изменить избранное."); })} type="button"><Heart aria-hidden="true" className={`size-4 ${favorite ? "fill-rose-500 text-rose-500" : ""}`} />{favorite ? "В избранном" : "В избранное"}</button>{message ? <p aria-live="polite" className="sr-only">{message}</p> : null}</div>;
}
