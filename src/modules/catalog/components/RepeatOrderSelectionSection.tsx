"use client";

import { Check, LoaderCircle, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  getRepeatOrderSelectionPreviewAction,
  prepareRepeatOrderSelectionAction,
} from "../../orders/actions/repeat-order-selection.actions";
import type {
  RepeatOrderSelectionLineDto,
  RepeatOrderSelectionPreviewDto,
  RepeatOrderSummaryDto,
} from "../../orders/services/quick-reorder.service";
import type { PartnerLocale } from "../../partner-locale";
import { emitLiveCommerceSelectionAddBatch } from "../services/live-commerce-selection";
import { ProductThumbnail } from "./ProductThumbnail";

export function RepeatOrderSelectionSection({
  canSelectProducts,
  initialOrderId,
  locale,
  orders,
}: {
  canSelectProducts: boolean;
  initialOrderId: string | null;
  locale: PartnerLocale;
  orders: RepeatOrderSummaryDto[];
}) {
  const copy = repeatOrderCopy(locale);
  const [preview, setPreview] = useState<RepeatOrderSelectionPreviewDto | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const initialOrderAttempted = useRef(false);

  const openOrder = useCallback(async (orderId: string) => {
    if (loadingOrderId) return;
    setLoadingOrderId(orderId);
    setMessage(null);
    const result = await getRepeatOrderSelectionPreviewAction(orderId);
    setLoadingOrderId(null);
    if (!result.success) {
      setMessage(copy.loadFailed);
      return;
    }
    setPreview(result.data);
    setQuantities(Object.fromEntries(result.data.lines.map((line) => [line.lineId, line.historicalQuantity])));
  }, [copy.loadFailed, loadingOrderId]);

  useEffect(() => {
    if (!initialOrderId || preview || loadingOrderId || initialOrderAttempted.current) return;
    initialOrderAttempted.current = true;
    void openOrder(initialOrderId);
  }, [initialOrderId, loadingOrderId, openOrder, preview]);

  function updateQuantity(lineId: string, quantity: number) {
    setQuantities((current) => ({
      ...current,
      [lineId]: Math.min(9999, Math.max(1, Math.trunc(quantity) || 1)),
    }));
    setMessage(null);
  }

  function useAvailableProducts() {
    if (!preview || pending || !canSelectProducts) return;
    const lines = preview.lines
      .filter((line) => line.status === "READY")
      .map((line) => ({ lineId: line.lineId, quantity: quantities[line.lineId] ?? line.historicalQuantity }));
    if (!lines.length) return;
    startTransition(async () => {
      setMessage(null);
      const result = await prepareRepeatOrderSelectionAction({ orderId: preview.orderId, lines });
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

  if (!orders.length && !initialOrderId) return null;

  return <section aria-labelledby="recent-orders-title" className="mx-auto max-w-3xl space-y-3" data-testid="recent-repeat-orders">
    <div>
      <h2 className="text-base font-semibold text-zinc-950" id="recent-orders-title">{copy.title}</h2>
      <p className="text-xs text-zinc-500">{copy.hint}</p>
    </div>
    {orders.length ? <div className="grid gap-2 sm:grid-cols-3">
      {orders.map((order) => <article className="rounded-lg border border-zinc-200 bg-white p-3" key={order.id}>
        <p className="font-semibold text-zinc-950">{order.orderLabel}</p>
        <p className="mt-1 text-xs text-zinc-500">{formatDate(order.documentDate, locale)} · {order.productCount} {copy.products} · {order.unitCount} {copy.units}</p>
        <button className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-700 px-3 text-sm font-semibold text-emerald-800 disabled:opacity-50" disabled={Boolean(loadingOrderId)} onClick={() => void openOrder(order.id)} type="button">
          {loadingOrderId === order.id ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RotateCcw aria-hidden="true" className="size-4" />}
          {copy.open}
        </button>
      </article>)}
    </div> : null}
    {message && !preview ? <p aria-live="polite" className="text-sm text-rose-700">{message}</p> : null}

    {preview ? <div className="fixed inset-0 z-50 bg-black/45" role="presentation">
      <section aria-label={copy.composition} aria-modal="true" className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl bg-zinc-50 pb-[env(safe-area-inset-bottom)] shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[36rem] sm:rounded-none" data-testid="repeat-order-composition" role="dialog">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
          <div><p className="text-xs font-semibold uppercase text-emerald-700">{copy.title}</p><h2 className="font-semibold text-zinc-950">{preview.orderLabel}</h2><p className="mt-1 text-xs text-zinc-600"><strong>{preview.readyCount}</strong> {copy.ready} · <strong>{preview.attentionCount}</strong> {copy.attention}</p></div>
          <button aria-label={copy.close} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-600" onClick={() => { setPreview(null); setMessage(null); }} type="button"><X aria-hidden="true" className="size-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {preview.lines.map((line) => <RepeatOrderLine copy={copy} key={line.lineId} line={line} onQuantity={updateQuantity} quantity={quantities[line.lineId] ?? line.historicalQuantity} />)}
        </div>
        <footer className="space-y-2 border-t border-zinc-200 bg-white p-4">
          {message ? <p aria-live="polite" className="text-sm font-medium text-emerald-800">{message}</p> : null}
          <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-600" disabled={!canSelectProducts || preview.readyCount === 0 || pending} onClick={useAvailableProducts} type="button">
            {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" />}
            {pending ? copy.refreshing : copy.useAvailable}
          </button>
          <p className="text-center text-xs text-zinc-500">{copy.currentTruth}</p>
        </footer>
      </section>
    </div> : null}
  </section>;
}

function RepeatOrderLine({ copy, line, onQuantity, quantity }: {
  copy: ReturnType<typeof repeatOrderCopy>;
  line: RepeatOrderSelectionLineDto;
  onQuantity: (lineId: string, quantity: number) => void;
  quantity: number;
}) {
  const ready = line.status === "READY";
  return <article className={`grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-lg border bg-white p-3 ${ready ? "border-zinc-200" : "border-amber-200"}`}>
    <div className="relative aspect-square overflow-hidden rounded bg-zinc-100"><ProductThumbnail alt="" className="object-contain p-1" sizes="56px" src={line.imageUrl} variant="sm" /></div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase text-zinc-500">SKU {line.sku}</p>
      <p className="line-clamp-2 text-sm font-semibold text-zinc-950">{line.productName}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <div><p className={`text-xs font-semibold ${ready ? "text-emerald-800" : "text-amber-800"}`}>{copy.status[line.status]}</p><p className="mt-1 text-sm font-semibold text-zinc-950">{line.currentPrice ?? copy.noPrice}</p><p className="text-xs text-zinc-500">{line.currentStock === null ? copy.stockUnknown : `${copy.stock}: ${line.currentStock} ${copy.units}`}</p></div>
        <div><p className="mb-1 text-[11px] text-zinc-500">{copy.previousQuantity}: {line.historicalQuantity}</p><div aria-label={copy.quantity} className="grid grid-cols-[2.75rem_3rem_2.75rem]" role="group"><button aria-label={copy.decrease} className="inline-flex h-11 items-center justify-center rounded-l-md border border-zinc-300 disabled:opacity-40" disabled={!ready || quantity <= 1} onClick={() => onQuantity(line.lineId, quantity - 1)} type="button"><Minus className="size-4" /></button><input aria-label={`${copy.quantity}: ${line.productName}`} className="h-11 min-w-0 border-y border-zinc-300 text-center font-semibold disabled:bg-zinc-100" disabled={!ready} inputMode="numeric" max={9999} min={1} onChange={(event) => onQuantity(line.lineId, Number(event.target.value))} type="number" value={quantity} /><button aria-label={copy.increase} className="inline-flex h-11 items-center justify-center rounded-r-md border border-zinc-300 disabled:opacity-40" disabled={!ready || quantity >= 9999} onClick={() => onQuantity(line.lineId, quantity + 1)} type="button"><Plus className="size-4" /></button></div></div>
      </div>
    </div>
  </article>;
}

function formatDate(value: string, locale: PartnerLocale) {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-RU", { dateStyle: "medium" }).format(new Date(value));
}

function repeatOrderCopy(locale: PartnerLocale) {
  if (locale === "ro") return {
    title: "Comenzi recente",
    hint: "Folosiți o comandă finalizată ca punct de pornire pentru selecția curentă.",
    open: "Folosește produsele",
    composition: "Componența comenzii",
    close: "Închide componența",
    products: "produse",
    units: "buc.",
    ready: "gata",
    attention: "necesită atenție",
    useAvailable: "Folosește produsele disponibile",
    refreshing: "Se verifică prețul și stocul…",
    currentTruth: "Prețul și stocul actual sunt verificate din nou înainte de adăugare.",
    loadFailed: "Comanda nu este disponibilă pentru selecția curentă.",
    added: (count: number) => `${count} produse au fost adăugate în selecție.`,
    addedWithAttention: (ready: number, attention: number) => `${ready} produse adăugate; ${attention} necesită atenție.`,
    quantity: "Cantitate",
    previousQuantity: "Cantitatea anterioară",
    decrease: "Micșorează cantitatea",
    increase: "Mărește cantitatea",
    noPrice: "Preț indisponibil",
    stock: "În stoc",
    stockUnknown: "Stoc indisponibil",
    status: { READY: "Gata", PRICE_UNAVAILABLE: "Preț indisponibil", PRODUCT_INACTIVE: "Produs inactiv", UNAVAILABLE: "Indisponibil" },
  } as const;
  return {
    title: "Последние заказы",
    hint: "Используйте завершённый заказ как основу текущей подборки.",
    open: "Использовать товары",
    composition: "Состав заказа",
    close: "Закрыть состав заказа",
    products: "товаров",
    units: "шт.",
    ready: "готово",
    attention: "требуют внимания",
    useAvailable: "Использовать доступные товары",
    refreshing: "Проверяем цену и наличие…",
    currentTruth: "Перед добавлением текущая цена и наличие проверяются повторно.",
    loadFailed: "Заказ недоступен для текущей подборки.",
    added: (count: number) => `${count} товаров добавлено в подборку.`,
    addedWithAttention: (ready: number, attention: number) => `${ready} товаров добавлено; ${attention} требуют внимания.`,
    quantity: "Количество",
    previousQuantity: "Было в заказе",
    decrease: "Уменьшить количество",
    increase: "Увеличить количество",
    noPrice: "Цена недоступна",
    stock: "В наличии",
    stockUnknown: "Наличие недоступно",
    status: { READY: "Готово", PRICE_UNAVAILABLE: "Цена недоступна", PRODUCT_INACTIVE: "Товар неактивен", UNAVAILABLE: "Недоступно" },
  } as const;
}
