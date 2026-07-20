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

const INITIAL_STATE: ActionResult<QuickReorderConversionResultDto | null> = { success: false, errorCode: "IDLE", message: "", data: null };

export function QuickReorderPanel({ preview, requestKey: initialRequestKey }: { preview: QuickReorderPreviewDto; requestKey: string }) {
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
          <p className="text-xs font-semibold uppercase text-emerald-700">Повторная покупка</p>
          <h1 className="mt-1 text-2xl font-semibold" id="quick-reorder-title">Купить снова из {preview.orderLabel}</h1>
          <p className="mt-2 text-sm text-zinc-600">Проверьте текущие цены и выберите нужные позиции.</p>
        </div>
        <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-800" href={`/cabinet/orders/${preview.orderId}`} prefetch={false}>Вернуться к заказу</Link>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Выбор позиций">
        <ToolbarButton icon={CheckSquare} label="Выбрать все" onClick={() => setAll("all")} />
        <ToolbarButton icon={Square} label="Снять выбор" onClick={() => setAll("none")} />
        <ToolbarButton icon={RotateCcw} label="Только доступные" onClick={() => setAll("available")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4" aria-label="Изменения цен">
        <SummaryMetric label="Без изменений" value={preview.commercialSummary.unchanged} />
        <SummaryMetric label="Цена выросла" value={preview.commercialSummary.increased} tone="amber" />
        <SummaryMetric label="Цена снизилась" value={preview.commercialSummary.decreased} tone="emerald" />
        <SummaryMetric label="Сравнение недоступно" value={preview.commercialSummary.unavailable} />
      </div>

      <ul className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white">
        {preview.lines.map((line) => {
          const checked = selected.has(line.lineId);
          return (
            <li className="grid gap-4 p-4 md:grid-cols-[28px_64px_minmax(180px,1fr)_150px_150px_130px] md:items-center" key={line.lineId}>
              <input
                aria-label={`Выбрать ${line.productName}`}
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
                <p className="text-xs text-zinc-500">Артикул: {line.sku}</p>
                <p className={`mt-2 text-xs font-semibold ${line.canSelect ? "text-emerald-700" : "text-amber-700"}`}>{line.statusLabel}</p>
                <p className="mt-1 text-xs text-zinc-500">Наличие: {line.availableStock === null ? "уточняется" : `${line.availableStock} ед.`}</p>
                {line.expectedArrival ? <p className="mt-1 text-xs text-zinc-500">Поступление: {line.expectedArrival.formattedDate ?? line.expectedArrival.date ?? "дата уточняется"}{line.expectedArrival.quantity !== null ? ` · ${line.expectedArrival.quantity} ед.` : ""}</p> : null}
                {!line.canSelect ? <Link className="mt-1 inline-flex text-xs font-semibold text-emerald-700" href={line.replacementHref ?? "/cabinet/catalog"} prefetch={false}>Найти замену</Link> : null}
              </div>
              <Price label="Цена в заказе" value={line.historicalUnitPrice.formatted} />
              <Price label="Текущая цена" value={line.currentUnitPrice?.formatted ?? "Недоступна"} />
              <div>
                <label className="text-xs font-medium text-zinc-500" htmlFor={`quantity-${line.lineId}`}>Количество</label>
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
                <p className="mt-1 text-xs text-zinc-500">Было: {line.historicalQuantity}</p>
              </div>
              {line.availableStock !== null && checked && quantities[line.lineId] > line.availableStock ? (
                <p className="flex gap-2 text-xs text-amber-700 md:col-start-3 md:col-span-4"><TriangleAlert className="size-4 shrink-0" />Часть количества может потребовать подтверждения</p>
              ) : null}
              <div className="text-xs md:col-start-4 md:col-span-3">
                <span className={line.priceDifference.kind === "increased" ? "font-semibold text-amber-700" : line.priceDifference.kind === "decreased" ? "font-semibold text-emerald-700" : "text-zinc-500"}>{line.priceDifference.label}</span>
                {line.priceDifference.formattedAbsoluteDifference && line.priceDifference.kind !== "unchanged" ? <span className="ml-2 text-zinc-600">{line.priceDifference.formattedAbsoluteDifference} · {line.priceDifference.formattedPercentageDifference}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>

      <form action={action} className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between" onSubmit={() => setNewAttempt(false)}>
        <input name="orderId" type="hidden" value={preview.orderId} />
        <input name="requestKey" type="hidden" value={requestKey} />
        <input name="lines" type="hidden" value={JSON.stringify(selectedLines)} />
        <p className="text-sm text-zinc-700">Выбрано: <strong>{selectedCount}</strong> поз., <strong>{selectedUnits}</strong> ед.</p>
        <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300" disabled={!selectedCount || pending || (state.success && !newAttempt)} type="submit">{pending ? "Добавление..." : "Добавить выбранное в корзину"}</button>
      </form>
      <div className="flex justify-end"><SaveAsPurchasingListButton label="Сохранить выбранное как список" orderId={preview.orderId} selections={selectedLines} source="quick_reorder" /></div>
      {state.errorCode !== "IDLE" && !state.success ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Не удалось добавить выбранные позиции. Выбор сохранён, проверьте данные и повторите попытку.</p> : null}
      {state.success && state.data ? <ConversionSummary orderId={preview.orderId} result={state.data} onNewAttempt={() => { setRequestKey(crypto.randomUUID()); setNewAttempt(true); }} /> : null}
    </section>
  );
}

function ConversionSummary({ orderId, result, onNewAttempt }: { orderId: string; result: QuickReorderConversionResultDto; onNewAttempt: () => void }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
      <h2 className="font-semibold text-emerald-950">Результат добавления</h2>
      {result.repeated ? <p className="mt-1 text-xs text-emerald-800">Повторный запрос распознан: количество не увеличено повторно.</p> : null}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-emerald-950">
        <span>Добавлено: <strong>{result.added}</strong></span><span>Обновлено: <strong>{result.updated}</strong></span>
        <span>Цена изменилась: <strong>{result.changedPrice}</strong></span><span>Нет текущей цены: <strong>{result.missingPrice}</strong></span>
        <span>Недоступно: <strong>{result.unavailable}</strong></span><span>Неактивно: <strong>{result.inactive}</strong></span><span>Пропущено: <strong>{result.skipped}</strong></span>
      </div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Показать позиции</summary><ul className="mt-2 space-y-1">{result.items.map((item) => <li key={item.lineId}>{item.sku} · {item.productName} — {conversionResultLabel(item.result)}</li>)}</ul></details>
      <div className="mt-4 flex flex-wrap gap-2">
        {result.cartId ? <Link className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white" href="/cabinet/cart" prefetch={false}>Перейти в корзину</Link> : null}
        <Link className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800" href={`/cabinet/orders/${orderId}`} prefetch={false}>Остаться в заказе</Link>
        <button className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800" onClick={onNewAttempt} type="button">Добавить ещё раз</button>
      </div>
    </div>
  );
}

function conversionResultLabel(result: QuickReorderConversionResultDto["items"][number]["result"]): string {
  return ({ added: "Добавлено", updated: "Обновлено", price_changed: "Цена изменилась", missing_price: "Нет текущей цены", unavailable: "Недоступно", inactive: "Неактивно", skipped: "Пропущено" })[result];
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
