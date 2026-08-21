"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { CheckSquare, RotateCcw, Square, TriangleAlert } from "lucide-react";

import type { QuickReorderPreviewDto } from "../services";
import type { ActionResult } from "../../access-control/actions/action-result";
import { addQuickReorderToCartAction } from "../actions/reorder.actions";
import type { QuickReorderConversionResultDto } from "../services";
import { CatalogCardImage } from "../../catalog/components/CatalogCardImage";
import { SaveAsPurchasingListButton } from "../../purchasing-lists/components";
import { getOrdersCopy, usePartnerLocale, type OrdersCopy } from "../../partner-locale";

const INITIAL_STATE: ActionResult<QuickReorderConversionResultDto | null> = { success: false, errorCode: "IDLE", message: "", data: null };

export function QuickReorderPanel({ preview, requestKey: initialRequestKey }: { preview: QuickReorderPreviewDto; requestKey: string }) {
  const copy = getOrdersCopy(usePartnerLocale());
  const [selected, setSelected] = useState(() => new Set(preview.lines.filter((line) => line.selectedByDefault).map((line) => line.lineId)));
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(preview.lines.map((line) => [line.lineId, line.historicalQuantity])));
  const selectedCount = selected.size;
  const selectedUnits = useMemo(() => [...selected].reduce((total, id) => total + (quantities[id] ?? 0), 0), [quantities, selected]);
  const [requestKey, setRequestKey] = useState(initialRequestKey);
  const [newAttempt, setNewAttempt] = useState(false);
  const [state, action, pending] = useActionState(addQuickReorderToCartAction, INITIAL_STATE);
  const selectedLines = [...selected].map((lineId) => ({ lineId, quantity: quantities[lineId] ?? 0 }));

  function setAll(mode: "all" | "none" | "available") {
    setSelected(mode === "none" ? new Set() : new Set(preview.lines.filter((line) => mode === "all" ? line.canSelect : line.canSelect && line.status !== "temporarily_unavailable").map((line) => line.lineId)));
  }

  return (
    <section className="space-y-4" aria-labelledby="quick-reorder-title">
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">{copy.quickReorderEyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold" id="quick-reorder-title">{copy.buyAgainFrom} {preview.orderLabel}</h1>
          <p className="mt-2 text-sm text-zinc-600">{preview.commercialMode === "full" ? copy.reviewPrices : copy.reviewRetailOnly}</p>
        </div>
        <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-800" href={`/cabinet/orders/${preview.orderId}`} prefetch={false}>{copy.backToOrder}</Link>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={copy.lineSelection}>
        <ToolbarButton icon={CheckSquare} label={copy.selectAll} onClick={() => setAll("all")} />
        <ToolbarButton icon={Square} label={copy.clearSelection} onClick={() => setAll("none")} />
        <ToolbarButton icon={RotateCcw} label={copy.availableOnly} onClick={() => setAll("available")} />
      </div>

      {preview.commercialMode === "full" ? <div className="grid gap-3 sm:grid-cols-4" aria-label={copy.priceChanges}>
        <SummaryMetric label={copy.unchanged} value={preview.commercialSummary.unchanged} />
        <SummaryMetric label={copy.priceIncreased} value={preview.commercialSummary.increased} tone="amber" />
        <SummaryMetric label={copy.priceDecreased} value={preview.commercialSummary.decreased} tone="emerald" />
        <SummaryMetric label={copy.comparisonUnavailable} value={preview.commercialSummary.unavailable} />
      </div> : null}

      <ul className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white">
        {preview.lines.map((line) => {
          const checked = selected.has(line.lineId);
          return (
            <li className="grid gap-4 p-4 md:grid-cols-[28px_64px_minmax(180px,1fr)_150px_150px_130px] md:items-center" key={line.lineId}>
              <input
                aria-label={`${copy.selectProduct} ${line.productName}`}
                checked={checked}
                className="size-4 accent-emerald-700"
                disabled={!line.canSelect}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(line.lineId); else next.delete(line.lineId);
                  return next;
                })}
                type="checkbox"
              />
              <div className="relative size-16 overflow-hidden rounded-md bg-zinc-100">
                <CatalogCardImage alt="" sizes="64px" src={line.imageUrl} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-950">{line.productName}</p>
                <p className="text-xs text-zinc-500">{copy.sku}: {line.sku}</p>
                <p className={`mt-2 text-xs font-semibold ${line.canSelect ? "text-emerald-700" : "text-amber-700"}`}>{reorderStatusLabel(line.status, copy)}</p>
                <p className="mt-1 text-xs text-zinc-500">{copy.availability}: {line.availableStock === null ? copy.pending : `${line.availableStock} ${copy.units}`}</p>
                {line.expectedArrival ? <p className="mt-1 text-xs text-zinc-500">{copy.arrival}: {line.expectedArrival.formattedDate ?? line.expectedArrival.date ?? copy.arrivalDatePending}{line.expectedArrival.quantity !== null ? ` · ${line.expectedArrival.quantity} ${copy.units}` : ""}</p> : null}
                {!line.canSelect ? <Link className="mt-1 inline-flex text-xs font-semibold text-emerald-700" href={line.replacementHref ?? "/cabinet/catalog"} prefetch={false}>{copy.findReplacement}</Link> : null}
              </div>
              {preview.commercialMode === "full" ? <Price label={copy.orderPrice} value={line.historicalUnitPrice?.formatted ?? copy.unavailable} /> : <Price label={copy.retailPrice} value={line.currentRetailPrice?.formatted ?? copy.pending} />}
              {preview.commercialMode === "full" ? <Price label={copy.currentPrice} value={line.currentUnitPrice?.formatted ?? copy.unavailable} /> : <div />}
              <div>
                <label className="text-xs font-medium text-zinc-500" htmlFor={`quantity-${line.lineId}`}>{copy.quantity}</label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
                  disabled={!line.canSelect}
                  id={`quantity-${line.lineId}`}
                  max={9999}
                  min={1}
                  onChange={(event) => setQuantities((current) => ({ ...current, [line.lineId]: Number(event.target.value) }))}
                  step={1}
                  type="number"
                  value={quantities[line.lineId]}
                />
                <p className="mt-1 text-xs text-zinc-500">{copy.previousQuantity}: {line.historicalQuantity}</p>
              </div>
              {line.availableStock !== null && checked && quantities[line.lineId] > line.availableStock ? (
                <p className="flex gap-2 text-xs text-amber-700 md:col-start-3 md:col-span-4"><TriangleAlert className="size-4 shrink-0" />{copy.partialQuantityWarning}</p>
              ) : null}
              {line.priceDifference ? <div className="text-xs md:col-start-4 md:col-span-3">
                <span className={line.priceDifference.kind === "increased" ? "font-semibold text-amber-700" : line.priceDifference.kind === "decreased" ? "font-semibold text-emerald-700" : "text-zinc-500"}>{priceDifferenceLabel(line.priceDifference.kind, copy)}</span>
                {line.priceDifference.formattedAbsoluteDifference && line.priceDifference.kind !== "unchanged" ? <span className="ml-2 text-zinc-600">{line.priceDifference.formattedAbsoluteDifference} · {line.priceDifference.formattedPercentageDifference}</span> : null}
              </div> : null}
            </li>
          );
        })}
      </ul>

      <form action={action} className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between" onSubmit={() => setNewAttempt(false)}>
        <input name="orderId" type="hidden" value={preview.orderId} />
        <input name="requestKey" type="hidden" value={requestKey} />
        <input name="lines" type="hidden" value={JSON.stringify(selectedLines)} />
        <p className="text-sm text-zinc-700">{copy.selected}: <strong>{selectedCount}</strong> {copy.positions}, <strong>{selectedUnits}</strong> {copy.units}</p>
        <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300" disabled={!selectedCount || pending || (state.success && !newAttempt)} type="submit">{pending ? copy.adding : copy.addSelectedToCart}</button>
      </form>
      <div className="flex justify-end"><SaveAsPurchasingListButton label={copy.saveSelectedAsList} orderId={preview.orderId} selections={selectedLines} source="quick_reorder" /></div>
      {state.errorCode !== "IDLE" && !state.success ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{copy.reorderAddError}</p> : null}
      {state.success && state.data ? <ConversionSummary copy={copy} orderId={preview.orderId} result={state.data} onNewAttempt={() => { setRequestKey(crypto.randomUUID()); setNewAttempt(true); }} /> : null}
    </section>
  );
}

function ConversionSummary({ copy, orderId, result, onNewAttempt }: { copy: OrdersCopy; orderId: string; result: QuickReorderConversionResultDto; onNewAttempt: () => void }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <h2 className="font-semibold text-emerald-950">{copy.addResult}</h2>
      {result.repeated ? <p className="mt-1 text-xs text-emerald-800">{copy.repeatedRequest}</p> : null}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-emerald-950">
        <span>{copy.added}: <strong>{result.added}</strong></span><span>{copy.updated}: <strong>{result.updated}</strong></span>
        <span>{copy.priceChanged}: <strong>{result.changedPrice}</strong></span><span>{copy.noCurrentPrice}: <strong>{result.missingPrice}</strong></span>
        <span>{copy.unavailable}: <strong>{result.unavailable}</strong></span><span>{copy.inactive}: <strong>{result.inactive}</strong></span><span>{copy.skipped}: <strong>{result.skipped}</strong></span>
      </div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">{copy.showItems}</summary><ul className="mt-2 space-y-1">{result.items.map((item) => <li key={item.lineId}>{item.sku} · {item.productName} — {conversionResultLabel(item.result, copy)}</li>)}</ul></details>
      <div className="mt-4 flex flex-wrap gap-2">
        {result.cartId ? <Link className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white" href="/cabinet/cart" prefetch={false}>{copy.goToCart}</Link> : null}
        <Link className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800" href={`/cabinet/orders/${orderId}`} prefetch={false}>{copy.stayInOrder}</Link>
        <button className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800" onClick={onNewAttempt} type="button">{copy.addAgain}</button>
      </div>
    </div>
  );
}

function conversionResultLabel(result: QuickReorderConversionResultDto["items"][number]["result"], copy: OrdersCopy): string {
  return ({ added: copy.added, updated: copy.updated, price_changed: copy.priceChanged, missing_price: copy.noCurrentPrice, unavailable: copy.unavailable, inactive: copy.inactive, skipped: copy.skipped })[result];
}

function reorderStatusLabel(status: QuickReorderPreviewDto["lines"][number]["status"], copy: OrdersCopy): string {
  return ({ available: copy.reorderAvailable, price_changed: copy.priceChanged, missing_price: copy.noCurrentPrice, temporarily_unavailable: copy.temporarilyUnavailable, unavailable: copy.noLongerAvailable, review_required: copy.reviewRequired })[status];
}

function priceDifferenceLabel(kind: NonNullable<QuickReorderPreviewDto["lines"][number]["priceDifference"]>["kind"], copy: OrdersCopy): string {
  return ({ unchanged: copy.unchanged, increased: copy.priceIncreased, decreased: copy.priceDecreased, unavailable: copy.comparisonUnavailable })[kind];
}

function Price({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium text-zinc-500">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p></div>;
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: typeof CheckSquare; label: string; onClick: () => void }) {
  return <button className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50" onClick={onClick} type="button"><Icon className="size-4" />{label}</button>;
}

function SummaryMetric({ label, value, tone = "zinc" }: { label: string; value: number; tone?: "zinc" | "amber" | "emerald" }) {
  const valueClass = tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : "text-zinc-950";
  return <div className="rounded-md border border-zinc-200 bg-white px-3 py-2"><p className="text-xs text-zinc-500">{label}</p><p className={`mt-1 text-lg font-semibold ${valueClass}`}>{value}</p></div>;
}
