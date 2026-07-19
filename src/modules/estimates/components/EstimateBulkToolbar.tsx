"use client";

import { BadgePercent, FolderInput, PackageCheck, Trash2 } from "lucide-react";
import { useState } from "react";

const inputClass = "h-9 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200";
const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-45";

export function EstimateBulkToolbar({ selectedCount, sections, dirty, disabled, onMarkup, onDiscount, onMove, onQuantity, onResetPrice, onRemove, onClear }: {
  selectedCount: number;
  sections: Array<{ id: string; name: string }>;
  dirty: boolean;
  disabled: boolean;
  onMarkup: (value: number) => void;
  onDiscount: (value: number) => void;
  onMove: (sectionId: string) => void;
  onQuantity: (value: number) => void;
  onResetPrice: () => void;
  onRemove: () => void;
  onClear: () => void;
}) {
  const [markup, setMarkup] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  if (!selectedCount) return null;

  return <section aria-label="Действия с выбранными позициями" className="sticky top-[4.5rem] z-10 border-y border-emerald-200 bg-emerald-50 p-3 shadow-sm">
    <div className="flex flex-wrap items-center gap-2">
      <strong className="mr-2 text-sm text-emerald-900">Выбрано: {selectedCount}</strong>
      <label className="flex items-center gap-1 text-xs">Наценка %<input aria-label="Наценка для выбранных" className={`${inputClass} w-20`} min="0" onChange={(event) => setMarkup(Number(event.target.value))} step="0.01" type="number" value={markup} /></label>
      <button aria-label="Применить наценку" className={buttonClass} disabled={disabled} onClick={() => onMarkup(markup)} type="button"><BadgePercent className="size-4" />Применить</button>
      <label className="flex items-center gap-1 text-xs">Скидка %<input aria-label="Скидка для выбранных" className={`${inputClass} w-20`} min="0" onChange={(event) => setDiscount(Number(event.target.value))} step="0.01" type="number" value={discount} /></label>
      <button aria-label="Применить скидку" className={buttonClass} disabled={disabled} onClick={() => onDiscount(discount)} type="button">Применить</button>
      <label className="flex items-center gap-1 text-xs">Количество<input aria-label="Количество для выбранных" className={`${inputClass} w-20`} min="0.001" onChange={(event) => setQuantity(Number(event.target.value))} step="0.001" type="number" value={quantity} /></label>
      <button aria-label="Обновить количество" className={buttonClass} disabled={disabled} onClick={() => onQuantity(quantity)} type="button">Обновить</button>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select aria-label="Раздел для выбранных" className={inputClass} onChange={(event) => setSectionId(event.target.value)} value={sectionId}>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select>
      <button className={buttonClass} disabled={disabled || !sectionId} onClick={() => onMove(sectionId)} type="button"><FolderInput className="size-4" />Переместить</button>
      <button className={buttonClass} disabled={disabled} onClick={onResetPrice} type="button"><PackageCheck className="size-4" />Текущая партнёрская цена</button>
      <button className={`${buttonClass} text-red-700`} disabled={disabled || dirty} onClick={onRemove} title={dirty ? "Сначала сохраните или отмените изменения" : undefined} type="button"><Trash2 className="size-4" />Удалить</button>
      <button className={buttonClass} onClick={onClear} type="button">Снять выделение</button>
    </div>
    <p className="mt-2 text-xs text-emerald-900">Изменения показаны в редакторе до сохранения. Сохранение применит их одной атомарной операцией.</p>
  </section>;
}
