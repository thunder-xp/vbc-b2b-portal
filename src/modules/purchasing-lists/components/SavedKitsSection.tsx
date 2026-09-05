"use client";

import { Check, Layers3, LoaderCircle, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { emitLiveCommerceSelectionAddBatch } from "../../catalog/services/live-commerce-selection";
import { ProductThumbnail } from "../../catalog/components/ProductThumbnail";
import { getSavedKitCopy, type PartnerLocale } from "../../partner-locale";
import type { LiveCommerceKitDetailDto, LiveCommerceKitLineDto, LiveCommerceKitSummaryDto } from "../types";
import {
  createLiveCommerceKitAction,
  getLiveCommerceKitAction,
  listLiveCommerceKitsAction,
  prepareLiveCommerceKitSelectionAction,
  updateLiveCommerceKitAction,
} from "../actions";
import { LIVE_COMMERCE_KIT_SAVED_EVENT } from "./SaveLiveSelectionAsKitButton";

export function SavedKitsSection({
  canManage,
  canSelectProducts,
  initialKitId,
  initialKits,
  locale,
}: {
  canManage: boolean;
  canSelectProducts: boolean;
  initialKitId: string | null;
  initialKits: LiveCommerceKitSummaryDto[];
  locale: PartnerLocale;
}) {
  const copy = getSavedKitCopy(locale);
  const [kits, setKits] = useState(initialKits);
  const [detail, setDetail] = useState<LiveCommerceKitDetailDto | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loadingKitId, setLoadingKitId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showSaveAsNew, setShowSaveAsNew] = useState(false);
  const [pending, startTransition] = useTransition();
  const initialAttempted = useRef(false);

  const refreshKits = useCallback(async () => {
    const result = await listLiveCommerceKitsAction();
    if (result.success) setKits(result.data);
  }, []);

  useEffect(() => {
    const refresh = () => void refreshKits();
    window.addEventListener(LIVE_COMMERCE_KIT_SAVED_EVENT, refresh);
    return () => window.removeEventListener(LIVE_COMMERCE_KIT_SAVED_EVENT, refresh);
  }, [refreshKits]);

  const openKit = useCallback(async (listId: string) => {
    if (loadingKitId) return;
    setLoadingKitId(listId);
    setMessage(null);
    const result = await getLiveCommerceKitAction(listId);
    setLoadingKitId(null);
    if (!result.success) {
      setMessage(copy.loadFailed);
      return;
    }
    setDetail(result.data);
    setQuantities(Object.fromEntries(result.data.lines.map((line) => [line.itemId, line.quantity])));
  }, [copy.loadFailed, loadingKitId]);

  useEffect(() => {
    if (!initialKitId || detail || loadingKitId || initialAttempted.current) return;
    initialAttempted.current = true;
    void openKit(initialKitId);
  }, [detail, initialKitId, loadingKitId, openKit]);

  function updateQuantity(itemId: string, quantity: number) {
    setQuantities((current) => ({ ...current, [itemId]: Math.min(9999, Math.max(1, Math.trunc(quantity) || 1)) }));
    setMessage(null);
  }

  function selectedItems() {
    return detail?.lines.map((line) => ({ itemId: line.itemId, quantity: quantities[line.itemId] ?? line.quantity })) ?? [];
  }

  function useKit() {
    if (!detail || pending || !canSelectProducts) return;
    startTransition(async () => {
      setMessage(null);
      const result = await prepareLiveCommerceKitSelectionAction({ listId: detail.id, items: selectedItems() });
      if (!result.success) {
        setMessage(copy.loadFailed);
        return;
      }
      if (result.data.items.length) emitLiveCommerceSelectionAddBatch(result.data.items);
      setMessage(result.data.attentionCount
        ? copy.addedWithAttention(result.data.readyCount, result.data.attentionCount)
        : copy.added(result.data.readyCount));
    });
  }

  function saveChanges() {
    if (!detail || pending || !detail.canManage) return;
    startTransition(async () => {
      const result = await updateLiveCommerceKitAction({ listId: detail.id, expectedRevision: detail.revision, items: selectedItems() });
      if (!result.success) {
        setMessage(copy.saveFailed);
        return;
      }
      setDetail({ ...detail, revision: result.data.revision, totalQuantity: selectedItems().reduce((sum, item) => sum + item.quantity, 0) });
      setMessage(copy.savedChanges);
      void refreshKits();
    });
  }

  function saveAsNew() {
    if (!detail || !newName.trim() || pending) return;
    startTransition(async () => {
      const result = await createLiveCommerceKitAction({
        name: newName,
        items: detail.lines.map((line) => ({ productId: line.productId, quantity: quantities[line.itemId] ?? line.quantity })),
      });
      if (!result.success) {
        setMessage(copy.saveFailed);
        return;
      }
      setMessage(result.data.skipped ? copy.savedPartial(result.data.saved, result.data.skipped) : copy.saved);
      setNewName("");
      setShowSaveAsNew(false);
      void refreshKits();
    });
  }

  return <section aria-labelledby="saved-kits-title" className="mx-auto max-w-3xl space-y-3" data-testid="saved-kits-section" id="saved-kits">
    <div>
      <h2 className="text-base font-semibold text-zinc-950" id="saved-kits-title">{copy.title}</h2>
      <p className="text-xs text-zinc-500">{copy.hint}</p>
    </div>
    {kits.length ? <div className="grid gap-2 sm:grid-cols-3">
      {kits.map((kit) => <article className="rounded-lg border border-zinc-200 bg-white p-3" key={kit.id}>
        <p className="truncate font-semibold text-zinc-950">{kit.name}</p>
        <p className="mt-1 text-xs text-zinc-500">{kit.itemCount} {copy.products} · {kit.totalQuantity} {copy.units}</p>
        <p className="mt-1 text-[11px] text-zinc-400">{copy.modified}: {formatDate(kit.updatedAt, locale)}</p>
        <button className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-700 px-3 text-sm font-semibold text-emerald-800 disabled:opacity-50" disabled={Boolean(loadingKitId)} onClick={() => void openKit(kit.id)} type="button">
          {loadingKitId === kit.id ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Layers3 aria-hidden="true" className="size-4" />}{copy.open}
        </button>
      </article>)}
    </div> : <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-600">{copy.empty}</p>}
    {message && !detail ? <p aria-live="polite" className="text-sm text-rose-700">{message}</p> : null}

    {detail ? <div className="fixed inset-0 z-50 bg-black/45" role="presentation">
      <section aria-label={detail.name} aria-modal="true" className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl bg-zinc-50 pb-[env(safe-area-inset-bottom)] shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[36rem] sm:rounded-none" data-testid="saved-kit-composition" role="dialog">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
          <div><p className="text-xs font-semibold uppercase text-emerald-700">{copy.title}</p><h2 className="font-semibold text-zinc-950">{detail.name}</h2><p className="mt-1 text-xs text-zinc-600"><strong>{detail.readyCount}</strong> {copy.ready} · <strong>{detail.attentionCount}</strong> {copy.attention}</p></div>
          <button aria-label={copy.close} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-600" onClick={() => { setDetail(null); setMessage(null); setShowSaveAsNew(false); }} type="button"><X aria-hidden="true" className="size-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {detail.lines.map((line) => <KitLine copy={copy} key={line.itemId} line={line} onQuantity={updateQuantity} quantity={quantities[line.itemId] ?? line.quantity} />)}
        </div>
        <footer className="space-y-2 border-t border-zinc-200 bg-white p-4">
          {message ? <p aria-live="polite" className="text-sm font-medium text-emerald-800">{message}</p> : null}
          <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-600" disabled={!canSelectProducts || detail.readyCount === 0 || pending} onClick={useKit} type="button"><Check aria-hidden="true" className="size-4" />{pending ? copy.refreshing : copy.useKit}</button>
          <p className="text-center text-xs text-zinc-500">{copy.currentTruth}</p>
          {canManage && detail.canManage ? <div className="grid grid-cols-2 gap-2">
            <button className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 disabled:text-zinc-400" disabled={pending} onClick={saveChanges} type="button">{copy.saveChanges}</button>
            <button className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 disabled:text-zinc-400" disabled={pending} onClick={() => setShowSaveAsNew((value) => !value)} type="button">{copy.saveAsNew}</button>
          </div> : null}
          {showSaveAsNew ? <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input aria-label={copy.newName} className="h-11 min-w-0 rounded-md border border-zinc-300 px-3 text-sm" maxLength={120} onChange={(event) => setNewName(event.target.value)} placeholder={copy.newName} value={newName} /><button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={!newName.trim() || pending} onClick={saveAsNew} type="button">{copy.save}</button></div> : null}
        </footer>
      </section>
    </div> : null}
  </section>;
}

function KitLine({ copy, line, onQuantity, quantity }: {
  copy: ReturnType<typeof getSavedKitCopy>;
  line: LiveCommerceKitLineDto;
  onQuantity: (itemId: string, quantity: number) => void;
  quantity: number;
}) {
  const ready = line.status === "READY";
  return <article className={`grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-lg border bg-white p-3 ${ready ? "border-zinc-200" : "border-amber-200"}`}>
    <div className="relative aspect-square overflow-hidden rounded bg-zinc-100"><ProductThumbnail alt="" className="object-contain p-1" sizes="56px" src={line.imageUrl} variant="sm" /></div>
    <div className="min-w-0"><p className="text-[11px] font-semibold uppercase text-zinc-500">SKU {line.sku}</p><p className="line-clamp-2 text-sm font-semibold text-zinc-950">{line.productName}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2"><div><p className={`text-xs font-semibold ${ready ? "text-emerald-800" : "text-amber-800"}`}>{copy.status[line.status]}</p><p className="mt-1 text-sm font-semibold text-zinc-950">{line.currentPrice ?? copy.noPrice}</p><p className="text-xs text-zinc-500">{line.currentStock === null ? copy.stockUnknown : `${copy.stock}: ${line.currentStock} ${copy.units}`}</p></div>
        <div aria-label={copy.quantity} className="grid grid-cols-[2.75rem_3rem_2.75rem]" role="group"><button aria-label={copy.decrease} className="inline-flex h-11 items-center justify-center rounded-l-md border border-zinc-300 disabled:opacity-40" disabled={quantity <= 1} onClick={() => onQuantity(line.itemId, quantity - 1)} type="button"><Minus className="size-4" /></button><input aria-label={`${copy.quantity}: ${line.productName}`} className="h-11 min-w-0 border-y border-zinc-300 text-center font-semibold" inputMode="numeric" max={9999} min={1} onChange={(event) => onQuantity(line.itemId, Number(event.target.value))} type="number" value={quantity} /><button aria-label={copy.increase} className="inline-flex h-11 items-center justify-center rounded-r-md border border-zinc-300 disabled:opacity-40" disabled={quantity >= 9999} onClick={() => onQuantity(line.itemId, quantity + 1)} type="button"><Plus className="size-4" /></button></div>
      </div>
    </div>
  </article>;
}

function formatDate(value: string, locale: PartnerLocale) {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value));
}
