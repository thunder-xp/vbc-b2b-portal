"use client";

import {
  Calculator,
  Layers3,
  Save,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { PurchasingListProductRow } from "./PurchasingListProductRow";
import { PurchasingListActions } from "./PurchasingListActions";
import { listPrimaryButton, listSecondaryButton, listIconButton, listInput } from "./purchasing-list-presentation";
import { purchasingListEditorCopy } from "../../partner-locale/purchasing-list-editor-copy";
import { emitLiveCommerceSelectionAdd, type LiveCommerceSelectionProduct } from "../../catalog/services/live-commerce-selection";
import {
  getSavedKitCopy,
  procurementCopy,
  usePartnerLocale,
} from "../../partner-locale";
import type { PurchasingListDetailDto } from "../types";
import {
  addPurchasingListToCartAction,
  createEstimateFromPurchasingListAction,
  removePurchasingListItemsAction,
  updatePurchasingListItemsAction,
  updatePurchasingListMetadataAction,
} from "../actions";

export function PurchasingListEditor({
  initial,
}: {
  initial: PurchasingListDetailDto;
}) {
  const router = useRouter();
  const locale = usePartnerLocale();
  const copy = procurementCopy(locale);
  const editorCopy = purchasingListEditorCopy(locale);
  const kitCopy = getSavedKitCopy(locale);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [lines, setLines] = useState(initial.lines);
  const [selected, setSelected] = useState(new Set<string>());
  const [cartRequestKey, setCartRequestKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [estimateRequestKey, setEstimateRequestKey] = useState(() =>
    crypto.randomUUID(),
  );
  const editable =
    Boolean(initial.canManage || initial.isSystemFavorites) && !initial.archivedAt;
  const selections = useMemo(
    () => [...selected].map((itemId) => ({ itemId })),
    [selected],
  );
  const mutate = (
    operation: () => Promise<{
      success: boolean;
      message: string;
      data: unknown;
    }>,
    redirect?: (data: unknown) => string,
    onSuccess?: () => void,
  ) =>
    startTransition(async () => {
      const result = await operation();
      setMessage(result.success ? copy.operationComplete : copy.operationError);
      if (result.success) onSuccess?.();
      if (result.success && redirect) router.push(redirect(result.data));
      else if (result.success) router.refresh();
    });
  const move = (index: number, direction: -1 | 1) =>
    setLines((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const dirty = lines.length !== initial.lines.length || lines.some((line, index) =>
    line.id !== initial.lines[index]?.id || line.quantity !== initial.lines[index]?.quantity);
  const attentionCount = lines.filter((line) => !line.canConvert).length;
  const cart = (selectedOnly: boolean) => mutate(
    () => addPurchasingListToCartAction({
      listId: initial.id,
      requestKey: cartRequestKey,
      ...(selectedOnly ? { selections } : {}),
    }), undefined, () => setCartRequestKey(crypto.randomUUID()),
  );
  const estimate = (selectedOnly: boolean) => mutate(
    () => createEstimateFromPurchasingListAction({
      listId: initial.id,
      name: `${copy.estimatePrefix} — ${initial.name}`,
      requestKey: estimateRequestKey,
      ...(selectedOnly ? { selections } : {}),
    }),
    (data) => `/cabinet/estimates/${(data as { estimateId: string }).estimateId}`,
    () => setEstimateRequestKey(crypto.randomUUID()),
  );

  return <div className="space-y-3" data-list-editor>
    <header className="space-y-2" data-list-header>
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={initial.isSystemFavorites ? "/cabinet/purchasing-lists?filter=favorites" : "/cabinet/purchasing-lists"}>← {initial.isSystemFavorites ? copy.selection : kitCopy.title}</Link>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold">{initial.isSystemFavorites ? copy.favorites : initial.name}</h1>
          {!initial.isSystemFavorites || initial.archivedAt ? <p className="mt-1 text-xs text-zinc-500" data-list-metadata>{initial.archivedAt ? copy.archive : initial.visibility === "private" ? copy.private : copy.company}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" data-page-actions>
          {!initial.archivedAt && !initial.isSystemFavorites ? <Link className={`${dirty ? listSecondaryButton : listPrimaryButton} col-span-2`} href={`/cabinet/quick-order?kit=${encodeURIComponent(initial.id)}#saved-kits`}><Layers3 aria-hidden="true" className="size-4 shrink-0" />{kitCopy.useKit}</Link> : null}
          {!initial.archivedAt && !selected.size ? <>
            <button className={initial.isSystemFavorites && !dirty ? listPrimaryButton : listSecondaryButton} disabled={pending} onClick={() => cart(false)} type="button"><ShoppingCart aria-hidden="true" className="size-4 shrink-0" />{editorCopy.cart}</button>
            <button className={listSecondaryButton} disabled={pending} onClick={() => estimate(false)} type="button"><Calculator aria-hidden="true" className="size-4 shrink-0" />{editorCopy.estimate}</button>
          </> : null}
          {editable && dirty ? <button className={`${listPrimaryButton} col-span-2`} disabled={pending} onClick={() => mutate(() => updatePurchasingListItemsAction(initial.id, initial.revision, lines.map((line, index) => ({
            itemId: line.id, quantity: line.quantity, position: index + 1, note: line.note,
          }))))} type="button"><Save aria-hidden="true" className="size-4 shrink-0" />{copy.saveChanges}</button> : null}
          <PurchasingListActions archived={Boolean(initial.archivedAt)} canManage={initial.canManage} disabled={pending || dirty} isSystemFavorites={Boolean(initial.isSystemFavorites)} listId={initial.id} onEdit={() => setSettingsOpen((value) => !value)} revision={initial.revision} />
        </div>
      </div>
      {dirty || attentionCount ? <p className="text-xs text-amber-800" role="status">{dirty ? editorCopy.unsaved : null}{dirty && attentionCount ? " · " : null}{attentionCount ? `${editorCopy.attention}: ${attentionCount}. ${editorCopy.availableOnly}.` : null}</p> : null}
    </header>

    {settingsOpen && !initial.isSystemFavorites && editable ? <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3" data-list-settings>
      <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{editorCopy.settings}</h2><button aria-label={copy.close} className={listIconButton} onClick={() => setSettingsOpen(false)} title={copy.close} type="button"><X aria-hidden="true" className="size-4" /></button></div>
      <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_160px_auto] xl:items-end" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        mutate(() => updatePurchasingListMetadataAction(initial.id, initial.revision, {
          name: String(data.get("name")), description: String(data.get("description")), visibility: String(data.get("visibility")) as "private" | "company",
        }), undefined, () => setSettingsOpen(false));
      }}>
        <label className="text-xs text-zinc-500">{copy.name}<input className={`${listInput} mt-1`} defaultValue={initial.name} maxLength={120} name="name" required /></label>
        <label className="text-xs text-zinc-500">{copy.description}<input className={`${listInput} mt-1`} defaultValue={initial.description ?? ""} maxLength={1000} name="description" /></label>
        <label className="text-xs text-zinc-500">{copy.access}<select className={`${listInput} mt-1`} defaultValue={initial.visibility} name="visibility"><option value="private">{copy.private}</option><option value="company">{copy.company}</option></select></label>
        <button className={listSecondaryButton} disabled={pending} type="submit">{copy.apply}</button>
      </form>
    </section> : null}

    {selected.size ? <section aria-label={editorCopy.selected} className="rounded-md border border-emerald-200 bg-emerald-50 p-2" data-selection-toolbar>
      <div className="flex items-center justify-between gap-2"><p className="px-1 text-sm font-semibold text-emerald-900">{editorCopy.selected}: {selected.size}</p><button aria-label={editorCopy.clearSelection} className={listIconButton} onClick={() => setSelected(new Set())} title={editorCopy.clearSelection} type="button"><X aria-hidden="true" className="size-4" /></button></div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {!initial.archivedAt ? <>
          <button className={listSecondaryButton} onClick={() => {
            lines.filter((line) => selected.has(line.id)).forEach((line) => emitLiveCommerceSelectionAdd({ product: purchasingListSelectionProduct(line), quantity: line.quantity }));
            setMessage(editorCopy.selectionAdded);
          }} type="button"><Layers3 aria-hidden="true" className="size-4 shrink-0" />{editorCopy.addToSelection}</button>
          <button className={listSecondaryButton} disabled={pending} onClick={() => cart(true)} type="button"><ShoppingCart aria-hidden="true" className="size-4 shrink-0" />{editorCopy.cart}</button>
          <button className={listSecondaryButton} disabled={pending} onClick={() => estimate(true)} type="button"><Calculator aria-hidden="true" className="size-4 shrink-0" />{editorCopy.estimate}</button>
        </> : null}
        {editable ? <button className={`${listSecondaryButton} text-rose-700`} disabled={pending} onClick={() => mutate(() => removePurchasingListItemsAction(initial.id, initial.revision, [...selected]))} type="button"><Trash2 aria-hidden="true" className="size-4 shrink-0" />{copy.removeSelected}</button> : null}
      </div>
    </section> : null}
    {message ? <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm" role="status">{message}</p> : null}
    {!lines.length ? <section className="rounded-md border border-dashed border-zinc-300 bg-white px-4 py-6 text-center">
      <h2 className="font-semibold">{initial.isSystemFavorites ? copy.favoritesEmpty : copy.emptyList}</h2>
      <Link className={`${listPrimaryButton} mt-3`} href="/cabinet/catalog">{copy.addProducts}</Link>
    </section> : <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
      {lines.map((line, index) => <PurchasingListProductRow editable={editable} first={index === 0} key={line.id} last={index === lines.length - 1} line={line} locale={locale}
        onMove={(direction) => move(index, direction)}
        onQuantity={(quantity) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity } : item))}
        onSelect={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(line.id); else next.delete(line.id); return next; })}
        selected={selected.has(line.id)} />)}
    </ul>}
  </div>;
}

function purchasingListSelectionProduct(line: PurchasingListDetailDto["lines"][number]): LiveCommerceSelectionProduct {
  const price = typeof line.currentPartnerPriceAmount === "number" && line.currentPartnerCurrencyCode
    ? {
        amount: line.currentPartnerPriceAmount,
        currencyCode: line.currentPartnerCurrencyCode,
        formattedAmount: line.currentPartnerPrice ?? `${line.currentPartnerPriceAmount} ${line.currentPartnerCurrencyCode}`,
        lastUpdatedAt: null,
      }
    : null;
  return {
    id: line.productId,
    sku: line.sku,
    name: line.productName,
    slug: line.slug ?? "",
    imageUrl: line.imageUrl,
    partnerPrice: price,
    stock: {
      status: (line.availableStock ?? 0) > 5 ? "in_stock" : (line.availableStock ?? 0) > 0 ? "low_stock" : line.expectedArrivalDate ? "expected" : "out_of_stock",
      label: line.stateLabel,
      exactAvailableQuantity: line.availableStock,
      lastUpdatedAt: null,
    },
  };
}
