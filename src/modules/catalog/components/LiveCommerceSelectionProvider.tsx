"use client";

import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";

import { addSelectionToCartAction } from "../../orders/actions/cart.actions";
import { getQuickProductCopy, usePartnerLocale } from "../../partner-locale";
import {
  LIVE_COMMERCE_SELECTION_ADD_EVENT,
  LIVE_COMMERCE_SELECTION_STORAGE_KEY,
  mergeLiveCommerceSelection,
  normalizeSelectionQuantity,
  normalizeStoredLiveCommerceSelection,
  type LiveCommerceSelectionAddDetail,
  type LiveCommerceSelectionItem,
} from "../services/live-commerce-selection";
import { ProductThumbnail } from "./ProductThumbnail";
import { refreshLiveCommerceSelectionAction } from "../actions/live-commerce-selection.action";

type SelectionContextValue = {
  items: LiveCommerceSelectionItem[];
  hydrated: boolean;
  clear: () => void;
};

const SelectionContext = createContext<SelectionContextValue>({ items: [], hydrated: false, clear: () => undefined });

export function useLiveCommerceSelection(): SelectionContextValue {
  return useContext(SelectionContext);
}

export function LiveCommerceSelectionProvider({
  canAddToCart,
  canCreateEstimate,
  children,
}: {
  canAddToCart: boolean;
  canCreateEstimate: boolean;
  children: ReactNode;
}) {
  const locale = usePartnerLocale();
  const copy = getQuickProductCopy(locale);
  const router = useRouter();
  const [items, setItems] = useState<LiveCommerceSelectionItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let restored: LiveCommerceSelectionItem[] = [];
    try {
      restored = normalizeStoredLiveCommerceSelection(JSON.parse(sessionStorage.getItem(LIVE_COMMERCE_SELECTION_STORAGE_KEY) ?? "[]"));
    } catch {
      sessionStorage.removeItem(LIVE_COMMERCE_SELECTION_STORAGE_KEY);
    }
    const restoreTimer = window.setTimeout(() => {
      setItems(restored);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    const add = (event: Event) => {
      const detail = (event as CustomEvent<LiveCommerceSelectionAddDetail>).detail;
      if (!detail?.product?.id) return;
      setItems((current) => mergeLiveCommerceSelection(current, detail));
      setMessage(null);
    };
    window.addEventListener(LIVE_COMMERCE_SELECTION_ADD_EVENT, add);
    return () => window.removeEventListener(LIVE_COMMERCE_SELECTION_ADD_EVENT, add);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (items.length) sessionStorage.setItem(LIVE_COMMERCE_SELECTION_STORAGE_KEY, JSON.stringify(items));
    else sessionStorage.removeItem(LIVE_COMMERCE_SELECTION_STORAGE_KEY);
  }, [hydrated, items]);

  const clear = useCallback(() => {
    setItems([]);
    setOpen(false);
    setMessage(null);
    sessionStorage.removeItem(LIVE_COMMERCE_SELECTION_STORAGE_KEY);
  }, []);
  const summary = useMemo(() => selectionSummary(items, locale, copy.totalUnavailable), [copy.totalUnavailable, items, locale]);
  const context = useMemo(() => ({ items, hydrated, clear }), [clear, hydrated, items]);

  function updateQuantity(productId: string, quantity: number) {
    setItems((current) => current.map((item) => item.id === productId ? { ...item, quantity: normalizeSelectionQuantity(quantity) } : item));
    setMessage(null);
  }

  function remove(productId: string) {
    setItems((current) => current.filter((item) => item.id !== productId));
    setMessage(null);
  }

  function addToCart() {
    if (!items.length || pending || !canAddToCart) return;
    startTransition(async () => {
      const result = await addSelectionToCartAction(items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        snapshotPartnerPrice: item.partnerPrice?.amount ?? null,
      })));
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      const quantityAdded = items.reduce((sum, item) => sum + item.quantity, 0);
      clear();
      window.dispatchEvent(new CustomEvent("novotech:cart-updated", { detail: { quantityAdded } }));
      router.push("/cabinet/cart");
    });
  }

  function openSelection() {
    setOpen(true);
    setMessage(null);
    startTransition(async () => {
      const result = await refreshLiveCommerceSelectionAction(items.map((item) => item.id));
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      const currentQuantity = new Map(items.map((item) => [item.id, item.quantity]));
      setItems(result.data.map((product) => ({ ...product, quantity: currentQuantity.get(product.id) ?? 1 })));
    });
  }

  return <SelectionContext value={context}>
    {children}
    {hydrated && items.length ? <>
      <aside className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-emerald-700 bg-zinc-950 px-4 py-3 text-white shadow-2xl lg:left-auto lg:right-6 lg:mx-0 lg:w-[26rem]" data-testid="live-selection-bar">
        <button className="flex min-h-11 min-w-0 flex-1 items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" onClick={openSelection} type="button">
          <span className="min-w-0"><span className="block text-sm font-semibold">{copy.selection} · {summary.productCount} {copy.productsShort}</span><span className="block truncate text-xs text-zinc-300">{summary.quantity} {copy.units} · {summary.total}</span></span>
        </button>
        <button className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-emerald-600 px-4 text-sm font-semibold" onClick={openSelection} type="button">{copy.openSelection}</button>
      </aside>
      {open ? <div className="fixed inset-0 z-50 bg-black/45" role="presentation">
        <section aria-label={copy.selection} aria-modal="true" className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[28rem] sm:rounded-none" data-testid="live-selection-panel" role="dialog">
          <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div><h2 className="font-semibold text-zinc-950">{copy.selection}</h2><p className="text-xs text-zinc-500">{summary.productCount} {copy.productsShort} · {summary.quantity} {copy.units} · {summary.total}</p></div>
            <button aria-label={copy.closeSelection} className="inline-flex size-11 items-center justify-center rounded-md text-zinc-600" onClick={() => setOpen(false)} type="button"><X aria-hidden="true" className="size-5" /></button>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {items.map((item) => <article className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-lg border border-zinc-200 p-3" key={item.id}>
              <Link className="relative aspect-square overflow-hidden rounded bg-zinc-100" href={`/cabinet/catalog/${item.slug}?returnTo=%2Fcabinet%2Fquick-order`} onClick={() => setOpen(false)} prefetch={false}><ProductThumbnail alt={item.name} className="object-contain p-1" sizes="56px" src={item.imageUrl} variant="sm" /></Link>
              <div className="min-w-0">
                <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase text-zinc-500">SKU {item.sku}</p><p className="line-clamp-2 text-sm font-semibold text-zinc-950">{item.name}</p></div><button aria-label={`${copy.remove}: ${item.name}`} className="inline-flex size-11 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-red-700" onClick={() => remove(item.id)} type="button"><Trash2 aria-hidden="true" className="size-4" /></button></div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div><p className={`text-sm font-semibold ${item.partnerPrice ? "text-zinc-950" : "text-amber-800"}`}>{item.partnerPrice?.formattedAmount ?? copy.priceUnavailable}</p><p className="text-xs text-zinc-500">{stockText(item, locale)}</p></div><div aria-label={copy.quantity} className="grid grid-cols-[2.75rem_3rem_2.75rem]" role="group"><button aria-label={copy.decrease} className="inline-flex h-11 items-center justify-center rounded-l-md border border-zinc-300" disabled={item.quantity <= 1} onClick={() => updateQuantity(item.id, item.quantity - 1)} type="button"><Minus className="size-4" /></button><input aria-label={`${copy.quantity}: ${item.name}`} className="h-11 min-w-0 border-y border-zinc-300 text-center font-semibold" inputMode="numeric" max={9999} min={1} onChange={(event) => updateQuantity(item.id, Number(event.target.value))} type="number" value={item.quantity} /><button aria-label={copy.increase} className="inline-flex h-11 items-center justify-center rounded-r-md border border-zinc-300" disabled={item.quantity >= 9999} onClick={() => updateQuantity(item.id, item.quantity + 1)} type="button"><Plus className="size-4" /></button></div></div>
                <p className="mt-1 text-right text-xs font-semibold text-zinc-700">{lineTotal(item, locale, copy.totalUnavailable)}</p>
              </div>
            </article>)}
          </div>
          <footer className="space-y-2 border-t border-zinc-200 bg-white p-4">
            {message ? <p aria-live="polite" className="text-sm text-red-700">{message}</p> : null}
            {canCreateEstimate
              ? <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href="/cabinet/estimates/new?source=selection" onClick={() => setOpen(false)} prefetch={false}>{copy.createEstimate}</Link>
              : <span aria-disabled="true" className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-200 px-4 text-sm font-semibold text-zinc-500">{copy.createEstimate}</span>}
            <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-700 bg-white px-4 text-sm font-semibold text-emerald-800 disabled:border-zinc-300 disabled:text-zinc-400" disabled={!canAddToCart || pending} onClick={addToCart} type="button"><ShoppingCart aria-hidden="true" className="size-4" />{pending ? copy.addingSelectionToCart : copy.selectionToCart}</button>
            <button className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-zinc-600" onClick={clear} type="button">{copy.clearSelection}</button>
          </footer>
        </section>
      </div> : null}
    </> : null}
  </SelectionContext>;
}

function selectionSummary(items: LiveCommerceSelectionItem[], locale: "ru" | "ro", unavailable: string) {
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const priced = items.map((item) => item.partnerPrice);
  const currencies = [...new Set(priced.flatMap((price) => price?.currencyCode ? [price.currencyCode] : []))];
  const total = priced.some((price) => !price) || currencies.length !== 1
    ? unavailable
    : formatMoney(items.reduce((sum, item) => sum + (item.partnerPrice?.amount ?? 0) * item.quantity, 0), currencies[0]!, locale);
  return { productCount: items.length, quantity, total };
}

function lineTotal(item: LiveCommerceSelectionItem, locale: "ru" | "ro", unavailable: string) {
  return item.partnerPrice ? formatMoney(item.partnerPrice.amount * item.quantity, item.partnerPrice.currencyCode, locale) : unavailable;
}

function formatMoney(amount: number, currencyCode: string, locale: "ru" | "ro") {
  return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-RU", { style: "currency", currency: currencyCode }).format(amount);
}

function stockText(item: LiveCommerceSelectionItem, locale: "ru" | "ro") {
  const quantity = item.stock?.exactAvailableQuantity;
  if (typeof quantity === "number" && quantity > 0) return locale === "ro" ? `În stoc: ${quantity} buc.` : `В наличии: ${quantity} шт.`;
  if (item.stock?.status === "expected") return locale === "ro" ? "Se așteaptă" : "Ожидается";
  if (item.stock?.status === "out_of_stock") return locale === "ro" ? "Indisponibil" : "Нет в наличии";
  return locale === "ro" ? "Disponibilitatea se confirmă" : "Наличие уточняется";
}
