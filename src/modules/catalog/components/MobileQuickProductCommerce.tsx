"use client";

import { ChevronRight, LayoutGrid, Minus, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { listPreviouslyPurchasedProductsAction } from "../../orders/actions/previously-purchased-products.action";
import type { PreviouslyPurchasedProductDto } from "../../orders/services/order-history.service";
import { getQuickProductCopy, type PartnerLocale } from "../../partner-locale";
import { emitLiveCommerceSelectionAdd, toLiveCommerceSelectionProduct } from "../services/live-commerce-selection";
import type { QuickProductSearchResultDto } from "../services/quick-product-search";
import { useLiveCommerceSelection } from "./LiveCommerceSelectionProvider";
import { ProductAvailabilityBlock } from "./ProductAvailabilityBlock";
import { ProductThumbnail } from "./ProductThumbnail";

type SearchResponse =
  | { success: true; data: QuickProductSearchResultDto[] }
  | { success: false; message?: string };

type CommerceProduct = QuickProductSearchResultDto | PreviouslyPurchasedProductDto;
type PreviousPage = { items: PreviouslyPurchasedProductDto[]; totalCount: number };

export function MobileQuickProductCommerce({
  canSelectProducts,
  locale,
  previouslyPurchased = { items: [], totalCount: 0 },
}: {
  canSelectProducts: boolean;
  locale: PartnerLocale;
  previouslyPurchased?: PreviousPage;
}) {
  const copy = getQuickProductCopy(locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const lastRequestedRef = useRef<string | null>(null);
  const pastedQueryRef = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickProductSearchResultDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [previousOpen, setPreviousOpen] = useState(false);
  const [expandedPrevious, setExpandedPrevious] = useState(previouslyPurchased.items);
  const [previousLoading, setPreviousLoading] = useState(false);
  const selection = useLiveCommerceSelection();

  useEffect(() => {
    const saved = sessionStorage.getItem("novotech:live-commerce-search:v1") ?? "";
    if (saved.length < 2 || saved.length > 100) return;
    const restoreTimer = window.setTimeout(() => setQuery(saved), 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (query.trim()) sessionStorage.setItem("novotech:live-commerce-search:v1", query);
    else sessionStorage.removeItem("novotech:live-commerce-search:v1");
  }, [query]);

  const runSearch = useCallback(async (rawQuery: string) => {
    const normalized = rawQuery.trim();
    if (normalized.length < 2 || normalized.length > 100) return;
    const requestKey = normalized.toLocaleLowerCase("en");
    if (lastRequestedRef.current === requestKey) return;
    lastRequestedRef.current = requestKey;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++requestSequenceRef.current;
    setLoading(true);
    setSearchFailed(false);
    setRequestCount((count) => count + 1);
    try {
      const response = await fetch(`/api/catalog/quick-search?q=${encodeURIComponent(normalized)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json() as SearchResponse;
      if (controller.signal.aborted || sequence !== requestSequenceRef.current) return;
      if (!response.ok || !payload.success) {
        setSearchFailed(true);
        setResults([]);
        lastRequestedRef.current = null;
        return;
      }
      setResults(payload.data);
    } catch {
      if (controller.signal.aborted || sequence !== requestSequenceRef.current) return;
      setSearchFailed(true);
      setResults([]);
      lastRequestedRef.current = null;
    } finally {
      if (!controller.signal.aborted && sequence === requestSequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2 || normalized.length > 100) return;
    const pasted = pastedQueryRef.current === normalized.toLocaleLowerCase("en");
    pastedQueryRef.current = null;
    const delay = pasted ? 0 : isLikelyExactIdentifier(normalized) ? 90 : 240;
    const timer = window.setTimeout(() => void runSearch(normalized), delay);
    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function updateSearchQuery(value: string) {
    setQuery(value);
    const normalized = value.trim();
    if (normalized.length >= 2 && normalized.length <= 100) {
      if (lastRequestedRef.current === normalized.toLocaleLowerCase("en")) {
        setLoading(false);
        setSearchFailed(false);
        return;
      }
      setLoading(true);
      setSearchFailed(false);
      return;
    }
    controllerRef.current?.abort();
    lastRequestedRef.current = null;
    setResults([]);
    setLoading(false);
    setSearchFailed(false);
  }

  function updateQuantity(productId: string, value: number) {
    setQuantities((current) => ({ ...current, [productId]: Math.min(9999, Math.max(1, Math.trunc(value) || 1)) }));
    setFeedback((current) => ({ ...current, [productId]: "" }));
  }

  function addProduct(product: CommerceProduct) {
    const quantity = quantities[product.id] ?? 1;
    if (!canSelectProducts || !product.commercialView?.partnerPrice) return;
    emitLiveCommerceSelectionAdd({ product: toLiveCommerceSelectionProduct(product), quantity });
    setFeedback((current) => ({ ...current, [product.id]: `${copy.added}: ${quantity} ${copy.units}` }));
    inputRef.current?.focus();
    inputRef.current?.select();
    setQuantities((current) => ({ ...current, [product.id]: 1 }));
  }

  async function openAllPrevious() {
    setPreviousOpen(true);
    if (previouslyPurchased.totalCount <= previouslyPurchased.items.length) return;
    setPreviousLoading(true);
    const result = await listPreviouslyPurchasedProductsAction({ limit: 20, offset: 0 });
    if (result.success) setExpandedPrevious(result.data.items);
    setPreviousLoading(false);
  }

  const selectedQuantity = (productId: string) => selection.items.find((item) => item.id === productId)?.quantity ?? 0;

  return (
    <section className="mx-auto max-w-[90rem] space-y-4" data-search-request-count={requestCount}>
      <div className="mx-auto max-w-3xl space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">{copy.title}</h1>
        <p className="text-sm leading-5 text-zinc-600">{copy.subtitle}</p>
        <nav aria-label={copy.title} className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm font-semibold text-emerald-800">
          <Link href="/cabinet/catalog?view=all" prefetch={false}>{copy.browseCatalog}</Link>
          <Link href="/cabinet/opportunities" prefetch={false}>{copy.recentlyPurchased}</Link>
          <Link href="/cabinet/purchasing-lists" prefetch={false}>{copy.favorites}</Link>
        </nav>
      </div>

      <div className="sticky top-0 z-20 mx-auto max-w-3xl border-y border-zinc-200 bg-white/95 py-3 shadow-sm backdrop-blur sm:rounded-lg sm:border sm:px-4">
        <div className="flex items-center gap-2">
          <form className="min-w-0 flex-1" onSubmit={(event) => { event.preventDefault(); lastRequestedRef.current = null; void runSearch(query); }} role="search">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-500" />
              <input aria-label={copy.searchLabel} autoCapitalize="characters" autoComplete="off" autoCorrect="off" autoFocus className="h-12 w-full rounded-lg border border-zinc-300 bg-white pl-10 pr-12 text-base font-medium uppercase outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" enterKeyHint="search" inputMode="search" maxLength={100} onChange={(event) => updateSearchQuery(event.target.value)} onPaste={(event) => { const value = event.clipboardData.getData("text").trim(); if (!value) return; event.preventDefault(); pastedQueryRef.current = value.toLocaleLowerCase("en"); updateSearchQuery(value); }} placeholder={copy.searchPlaceholder} ref={inputRef} spellCheck={false} type="search" value={query} />
              {query ? <button aria-label={copy.clear} className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-r-lg text-zinc-500 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600" onClick={() => { updateSearchQuery(""); inputRef.current?.focus(); }} type="button"><X aria-hidden="true" className="size-5" /></button> : null}
            </div>
          </form>
          <Link aria-label={copy.browseCatalog} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href="/cabinet/catalog?view=all" prefetch={false} title={copy.browseCatalog}><LayoutGrid aria-hidden="true" className="size-5" /></Link>
        </div>
        {loading ? <p aria-live="polite" className="mt-2 text-xs font-medium text-emerald-800">{copy.searching}</p> : null}
      </div>

      {!query.trim() ? <PreviouslyPurchasedSection canSelectProducts={canSelectProducts} copy={copy} feedback={feedback} items={previouslyPurchased.items} locale={locale} onAdd={addProduct} onOpenAll={() => void openAllPrevious()} onQuantity={updateQuantity} quantities={quantities} selectedQuantity={selectedQuantity} totalCount={previouslyPurchased.totalCount} /> : null}

      <div aria-busy={loading} className="mx-auto max-w-3xl space-y-3">
        {!query.trim() && previouslyPurchased.items.length === 0 ? <EmptyState title={copy.previousEmpty} detail={copy.startHint} /> : null}
        {query.trim().length >= 2 && !loading && !searchFailed && results.length === 0 ? <EmptyState title={copy.noResults} detail={copy.noResultsHint} /> : null}
        {searchFailed ? <EmptyState title={copy.noResults} detail={copy.addFailed} /> : null}
        {results.map((product) => <ProductCard canSelectProducts={canSelectProducts} copy={copy} feedback={feedback[product.id]} key={product.id} loading={loading} locale={locale} onAdd={addProduct} onQuantity={updateQuantity} product={product} quantity={quantities[product.id] ?? 1} selectedQuantity={selectedQuantity(product.id)} />)}
      </div>

      {previousOpen ? <div className="fixed inset-0 z-50 bg-black/45" role="presentation">
        <section aria-label={copy.purchasedBefore} aria-modal="true" className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-2xl bg-zinc-50 shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[32rem] sm:rounded-none" data-testid="previously-purchased-panel" role="dialog">
          <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3"><div><h2 className="font-semibold text-zinc-950">{copy.purchasedBefore}</h2><p className="text-xs text-zinc-500">{previouslyPurchased.totalCount} {copy.productsShort}</p></div><button aria-label={copy.closePurchased} className="inline-flex size-11 items-center justify-center rounded-md text-zinc-600" onClick={() => setPreviousOpen(false)} type="button"><X aria-hidden="true" className="size-5" /></button></header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {previousLoading ? <p className="py-8 text-center text-sm text-zinc-500">{copy.searching}</p> : expandedPrevious.map((product) => <ProductCard canSelectProducts={canSelectProducts} copy={copy} feedback={feedback[product.id]} key={product.id} locale={locale} onAdd={addProduct} onQuantity={updateQuantity} product={product} quantity={quantities[product.id] ?? 1} selectedQuantity={selectedQuantity(product.id)} />)}
          </div>
        </section>
      </div> : null}
    </section>
  );
}

function PreviouslyPurchasedSection({ canSelectProducts, copy, feedback, items, locale, onAdd, onOpenAll, onQuantity, quantities, selectedQuantity, totalCount }: {
  canSelectProducts: boolean;
  copy: ReturnType<typeof getQuickProductCopy>;
  feedback: Record<string, string>;
  items: PreviouslyPurchasedProductDto[];
  locale: PartnerLocale;
  onAdd: (product: CommerceProduct) => void;
  onOpenAll: () => void;
  onQuantity: (productId: string, quantity: number) => void;
  quantities: Record<string, number>;
  selectedQuantity: (productId: string) => number;
  totalCount: number;
}) {
  if (!items.length) return null;
  return <section aria-labelledby="previously-purchased-title" className="space-y-3" data-testid="previously-purchased-section">
    <div className="flex items-end justify-between gap-3"><div><h2 className="text-base font-semibold text-zinc-950" id="previously-purchased-title">{copy.purchasedBefore}</h2><p className="text-xs text-zinc-500">{copy.purchasedBeforeHint}</p></div>{totalCount > 1 ? <button className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm font-semibold text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={onOpenAll} type="button">{copy.showAll}</button> : null}</div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5" data-testid="previously-purchased-grid">
      {items.slice(0, 5).map((product, index) => <div className={index === 0 ? "min-w-0" : index === 1 ? "hidden min-w-0 md:block" : "hidden min-w-0 xl:block"} data-previous-card-index={index} key={product.id}><ProductCard canSelectProducts={canSelectProducts} compact copy={copy} feedback={feedback[product.id]} locale={locale} onAdd={onAdd} onQuantity={onQuantity} product={product} quantity={quantities[product.id] ?? 1} selectedQuantity={selectedQuantity(product.id)} /></div>)}
    </div>
    <div className="text-xs font-semibold text-zinc-600" data-testid="previously-purchased-remainder">{totalCount > 1 ? <span className="inline-flex rounded-full border border-zinc-200 bg-white px-2 py-1 md:hidden">+{Math.max(0, totalCount - 1)} {copy.productsShort}</span> : null}{totalCount > 2 ? <span className="hidden rounded-full border border-zinc-200 bg-white px-2 py-1 md:inline-flex xl:hidden">+{Math.max(0, totalCount - 2)} {copy.productsShort}</span> : null}{totalCount > 5 ? <span className="hidden rounded-full border border-zinc-200 bg-white px-2 py-1 xl:inline-flex">+{totalCount - 5} {copy.productsShort}</span> : null}</div>
  </section>;
}

function ProductCard({ canSelectProducts, compact = false, copy, feedback, loading = false, locale, onAdd, onQuantity, product, quantity, selectedQuantity }: {
  canSelectProducts: boolean;
  compact?: boolean;
  copy: ReturnType<typeof getQuickProductCopy>;
  feedback?: string;
  loading?: boolean;
  locale: PartnerLocale;
  onAdd: (product: CommerceProduct) => void;
  onQuantity: (productId: string, quantity: number) => void;
  product: CommerceProduct;
  quantity: number;
  selectedQuantity: number;
}) {
  const priced = Boolean(product.commercialView?.partnerPrice);
  const history = "purchaseCount" in product ? product : null;
  const exact = "matchKind" in product && product.matchKind !== "partial";
  return <article className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-opacity ${loading ? "pointer-events-none opacity-55" : "border-zinc-200"}`} data-testid={history ? "previously-purchased-card" : "quick-search-card"}>
    <div className={`grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 p-3 ${compact ? "xl:grid-cols-[4rem_minmax(0,1fr)] xl:gap-2" : ""}`}>
      <Link aria-label={copy.details} className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={`/cabinet/catalog/${product.slug}?returnTo=%2Fcabinet%2Fquick-order`} prefetch={false}><ProductThumbnail alt={product.name} className="object-contain p-2" sizes="88px" src={product.imageUrl} variant="sm" /></Link>
      <div className="min-w-0"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">SKU {product.sku}</p><Link className="mt-0.5 line-clamp-2 block text-sm font-semibold leading-5 text-zinc-950 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={`/cabinet/catalog/${product.slug}?returnTo=%2Fcabinet%2Fquick-order`} prefetch={false}>{product.name}</Link>{product.categoryName ? <p className="mt-0.5 truncate text-xs text-zinc-500">{product.categoryName}</p> : null}</div><ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-zinc-400" /></div>{exact ? <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">{copy.exact}</span> : null}{history?.repeatPurchaseDue ? <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">{copy.repeatDue}</span> : null}</div>
    </div>
    {history ? <div className="border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-600"><span className="font-semibold">{copy.purchasedTimes}: {history.purchaseCount}</span><span aria-hidden="true"> · </span><span>{copy.lastPurchase}: {formatPurchaseDate(history.lastPurchasedAt, locale)}</span></div> : null}
    <div className="grid grid-cols-2 border-y border-zinc-200"><div className="min-w-0 px-3 py-2.5"><p className="text-[11px] font-semibold text-zinc-500">{copy.price}</p><p className={`mt-0.5 truncate text-lg font-semibold ${priced ? "text-zinc-950" : "text-amber-800"}`}>{product.commercialView?.partnerPrice?.formattedAmount ?? copy.priceUnavailable}</p>{product.commercialView?.partnerPriceMdl?.formattedAmount ? <p className="text-xs font-medium text-zinc-500">{product.commercialView.partnerPriceMdl.formattedAmount}</p> : null}</div><ProductAvailabilityBlock locale={locale} stock={product.commercialView?.stock} /></div>
    <div className="space-y-2 p-3">{selectedQuantity > 0 ? <p className="text-xs font-semibold text-emerald-800">{copy.inSelection}: {selectedQuantity} {copy.units}</p> : null}<div className={`grid gap-2 ${compact ? "grid-cols-[8.75rem_minmax(0,1fr)] xl:grid-cols-1" : "grid-cols-[8.75rem_minmax(0,1fr)]"}`}><div aria-label={copy.quantity} className="grid grid-cols-[2.75rem_3.25rem_2.75rem]" role="group"><button aria-label={copy.decrease} className="inline-flex h-11 items-center justify-center rounded-l-lg border border-zinc-300 bg-zinc-50 text-zinc-800 disabled:opacity-40" disabled={quantity <= 1} onClick={() => onQuantity(product.id, quantity - 1)} type="button"><Minus aria-hidden="true" className="size-4" /></button><input aria-label={copy.quantity} className="h-11 min-w-0 border-y border-zinc-300 bg-white px-1 text-center text-base font-semibold outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600" inputMode="numeric" max={9999} min={1} onChange={(event) => onQuantity(product.id, Number(event.target.value))} pattern="[0-9]*" type="number" value={quantity} /><button aria-label={copy.increase} className="inline-flex h-11 items-center justify-center rounded-r-lg border border-zinc-300 bg-zinc-50 text-zinc-800 disabled:opacity-40" disabled={quantity >= 9999} onClick={() => onQuantity(product.id, quantity + 1)} type="button"><Plus aria-hidden="true" className="size-4" /></button></div><button className="inline-flex h-11 min-w-0 items-center justify-center rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:bg-zinc-300 disabled:text-zinc-600" disabled={loading || !canSelectProducts || !priced} onClick={() => onAdd(product)} title={!canSelectProducts || !priced ? copy.unavailableAction : undefined} type="button">{copy.add}</button></div><p aria-live="polite" className="min-h-4 text-xs font-medium text-emerald-700">{feedback ?? ""}</p></div>
  </article>;
}

function EmptyState({ detail, title }: { detail: string; title: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center"><p className="font-semibold text-zinc-900">{title}</p><p className="mt-1 text-sm text-zinc-500">{detail}</p></div>;
}

function formatPurchaseDate(value: string, locale: PartnerLocale): string {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value));
}

function isLikelyExactIdentifier(value: string): boolean {
  return /^\d{5,}$/.test(value) || /^(?=.*[a-z])(?=.*\d)[a-z0-9()[\]./_-]{5,}$/i.test(value);
}
