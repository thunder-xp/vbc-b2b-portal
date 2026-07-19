"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckSquare, RotateCcw, Square, TriangleAlert } from "lucide-react";

import type { QuickReorderPreviewDto } from "../services";

export function QuickReorderPanel({ preview }: { preview: QuickReorderPreviewDto }) {
  const [selected, setSelected] = useState(() => new Set(preview.lines.filter((line) => line.selectedByDefault).map((line) => line.lineId)));
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(preview.lines.map((line) => [line.lineId, line.historicalQuantity])));
  const selectedCount = selected.size;
  const selectedUnits = useMemo(() => [...selected].reduce((total, id) => total + (quantities[id] ?? 0), 0), [quantities, selected]);

  function setAll(mode: "all" | "none" | "available") {
    setSelected(mode === "none" ? new Set() : new Set(preview.lines.filter((line) => mode === "all" ? line.canSelect : line.status === "available").map((line) => line.lineId)));
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
                {line.imageUrl ? <Image alt="" fill sizes="64px" src={line.imageUrl} className="object-contain" /> : null}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-950">{line.productName}</p>
                <p className="text-xs text-zinc-500">Артикул: {line.sku}</p>
                <p className={`mt-2 text-xs font-semibold ${line.canSelect ? "text-emerald-700" : "text-amber-700"}`}>{line.statusLabel}</p>
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
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-700">Выбрано: <strong>{selectedCount}</strong> поз., <strong>{selectedUnits}</strong> ед.</p>
        <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300" disabled type="button">Добавить выбранное в корзину</button>
      </div>
    </section>
  );
}

function Price({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium text-zinc-500">{label}</p><p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p></div>;
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: typeof CheckSquare; label: string; onClick: () => void }) {
  return <button className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50" onClick={onClick} type="button"><Icon className="size-4" />{label}</button>;
}
