"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";

import type { LiveCommerceSelectionItem } from "../../catalog/services/live-commerce-selection";
import { createLiveCommerceKitAction } from "../actions";
import { getSavedKitCopy, usePartnerLocale } from "../../partner-locale";

export const LIVE_COMMERCE_KIT_SAVED_EVENT = "novotech:live-commerce-kit-saved";

export function SaveLiveSelectionAsKitButton({ items }: { items: LiveCommerceSelectionItem[] }) {
  const copy = getSavedKitCopy(usePartnerLocale());
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!name.trim() || !items.length || pending) return;
    startTransition(async () => {
      const result = await createLiveCommerceKitAction({
        name,
        items: items.map((item) => ({ productId: item.id, quantity: item.quantity })),
      });
      if (!result.success) {
        setMessage(copy.saveFailed);
        return;
      }
      setMessage(result.data.skipped ? copy.savedPartial(result.data.saved, result.data.skipped) : copy.saved);
      setName("");
      setEditing(false);
      window.dispatchEvent(new CustomEvent(LIVE_COMMERCE_KIT_SAVED_EVENT));
    });
  }

  if (!editing) return <div>
    <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800" onClick={() => { setEditing(true); setMessage(null); }} type="button"><Save aria-hidden="true" className="size-4" />{copy.saveSelection}</button>
    {message ? <p aria-live="polite" className="mt-1 text-sm font-medium text-emerald-800">{message}</p> : null}
  </div>;

  return <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
    <label className="block text-xs font-semibold text-zinc-700" htmlFor="live-commerce-kit-name">{copy.kitName}</label>
    <input autoFocus className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="live-commerce-kit-name" maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={copy.namePlaceholder} value={name} />
    <div className="grid grid-cols-2 gap-2">
      <button className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700" disabled={pending} onClick={() => { setEditing(false); setMessage(null); }} type="button">{copy.cancel}</button>
      <button className="min-h-11 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={!name.trim() || pending} onClick={save} type="button">{pending ? copy.saving : copy.save}</button>
    </div>
    {message ? <p aria-live="polite" className="text-sm text-rose-700">{message}</p> : null}
  </div>;
}
