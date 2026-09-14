"use client";

import { ListPlus, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { addEstimateProductsAction, addEstimateServicesAction, searchEstimateProductsAction } from "../actions/estimate.actions";
import type { EstimateDetailDto, EstimateProductPickerDto, EstimateServiceDto } from "../services";
import type { EstimateSectionSystemKey } from "../types";
import { getCatalogCopy, getEstimatesCopy, usePartnerLocale } from "../../partner-locale";
import { estimateStockLabel } from "./estimate-stock-label";

type Choice = { id: string; name: string; sku: string | null; price: string | null; stock: string | null; servicePrice?: number };

/** Keyboard selection is local; the explicit quantity confirmation is one structural command. */
export function EstimateQuickAdd({ estimate, services, sectionId, serviceMode, serviceWorkSectionKey, disabled, onResult, onExternal, onBatch, onPendingChange }: {
  estimate: EstimateDetailDto;
  services: EstimateServiceDto[];
  sectionId: string;
  serviceMode: boolean;
  serviceWorkSectionKey?: Extract<EstimateSectionSystemKey, "installation_works" | "commissioning_works">;
  disabled: boolean;
  onResult: (estimate: EstimateDetailDto, message: string) => void;
  onExternal: () => void;
  onBatch: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const locale = usePartnerLocale();
  const copy = getEstimatesCopy(locale);
  const catalogCopy = getCatalogCopy(locale);
  const text = locale === "ro" ? {
    search: "Cod, model sau denumire", quantity: "Cantitate de adăugat", add: "Adaugă", existing: "Deja în secțiune · cantitatea se adaugă",
    external: "Nu ați găsit poziția? Adăugați nomenclatură externă", batch: "Selectare multiplă", searching: "Se caută…", empty: "Niciun rezultat", hint: "↑ ↓ · Enter · Esc", cancel: "Anulează selecția",
  } : {
    search: "Код, модель или название", quantity: "Добавить количество", add: "Добавить", existing: "Уже в разделе · количество суммируется",
    external: "Не нашли позицию? Добавить внешнюю номенклатуру", batch: "Выбрать несколько", searching: "Поиск…", empty: "Ничего не найдено", hint: "↑ ↓ · Enter · Esc", cancel: "Отменить выбор",
  };
  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const restoreSearchFocus = useRef(false);
  const request = useRef<{ signature: string; key: string } | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; products: EstimateProductPickerDto["products"] }>({ query: "", products: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState<string | null>(null);
  const [searchingQuery, setSearchingQuery] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    // Focus only after React commits the enabled search field. A frame scheduled
    // inside the async transition can run while the input is still disabled.
    if (!pending && !disabled && !choice && restoreSearchFocus.current) {
      restoreSearchFocus.current = false;
      searchRef.current?.focus();
    }
  }, [pending, disabled, choice]);
  const queryText = query.trim();
  const searching = searchingQuery === queryText;
  const choices: Choice[] = serviceMode
    ? services.filter(item => item.workSectionKey === serviceWorkSectionKey && `${item.name} ${item.category}`.toLocaleLowerCase().includes(queryText.toLocaleLowerCase())).slice(0, 12).map(item => ({ id: item.id, name: item.name, sku: null, price: item.defaultSellingPrice?.toString() ?? null, stock: null, servicePrice: item.defaultSellingPrice ?? 0 }))
    : result.query === queryText ? result.products.map(item => ({ id: item.id, name: item.name, sku: item.sku, price: item.partnerPrice ?? null, stock: estimateStockLabel(item, catalogCopy) })) : [];

  useEffect(() => {
    let cancelled = false;
    if (disabled || serviceMode || !open || queryText.length < 2) return;
    const timer = window.setTimeout(async () => {
      setSearchingQuery(queryText);
      try {
        const response = await searchEstimateProductsAction({ search: queryText, includeFacets: false });
        if (cancelled) return;
        if (response.success) setResult({ query: queryText, products: response.data.products });
        else setMessage(response.message);
      } catch { if (!cancelled) setMessage(copy.operationFailed); }
      finally { if (!cancelled) setSearchingQuery(null); }
    }, 250);
    return () => { window.clearTimeout(timer); cancelled = true; };
  }, [copy.operationFailed, disabled, open, queryText, serviceMode]);

  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      const editing = event.target instanceof Element && Boolean(event.target.closest("input, textarea, select, [contenteditable=true]"));
      if (event.defaultPrevented || editing || disabled || pending) return;
      if (event.key === "/" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", focus);
    return () => document.removeEventListener("keydown", focus);
  }, [disabled, pending]);

  const choose = (item: Choice) => {
    setChoice(item); setQuantity("1"); setOpen(false); setMessage(null);
    requestAnimationFrame(() => { quantityRef.current?.focus(); quantityRef.current?.select(); });
  };
  const add = () => {
    if (!choice || pending || disabled) return;
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || !quantityRef.current?.checkValidity()) {
      quantityRef.current?.reportValidity(); return;
    }
    const selected = choice;
    const signature = JSON.stringify({ sectionId, id: selected.id, amount, serviceMode, revision: estimate.revision });
    if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
    const insertion = { targetSectionId: sectionId, requestKey: request.current.key, mergeExisting: !serviceMode };
    onPendingChange?.(true);
    startTransition(async () => {
      try {
        const response = serviceMode
          ? await addEstimateServicesAction(estimate.id, estimate.revision, [{ serviceId: selected.id, quantity: amount, sellingUnitPrice: selected.servicePrice ?? 0 }], insertion)
          : await addEstimateProductsAction(estimate.id, estimate.revision, [{ productId: selected.id, quantity: amount }], insertion);
        if (!response.success) { setMessage(response.message); return; }
        request.current = null;
        restoreSearchFocus.current = true;
        onResult(response.data, response.message);
        setChoice(null); setQuery(""); setResult({ query: "", products: [] }); setMessage(null);
      } catch { setMessage(copy.operationFailed); }
      finally { onPendingChange?.(false); }
    });
  };
  const close = () => { setChoice(null); searchRef.current?.focus(); setOpen(false); };
  return <div className="relative min-w-0" data-testid="estimate-quick-add" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" />
        <input ref={searchRef} id="estimate-quick-search" aria-label={text.search} aria-expanded={open && !choice} aria-controls="estimate-quick-results" aria-activedescendant={open && choices[active] ? `estimate-quick-option-${active}` : undefined} role="combobox" aria-autocomplete="list" autoComplete="off" className="h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm focus-visible:outline-emerald-600 disabled:bg-zinc-100" disabled={disabled || pending} value={query} placeholder={text.search} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActive(0); setChoice(null); setOpen(true); setMessage(null); }} onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive(current => choices.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length : 0);
          }
          if (event.key === "Enter") { event.preventDefault(); if (choices[active] && !searching) choose(choices[active]); }
        }} />
      </div>
      <button type="button" aria-label={text.batch} title={text.batch} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-xs font-semibold" disabled={disabled || pending} onClick={onBatch}><ListPlus className="size-4" /><span className="hidden sm:inline">{text.batch}</span></button>
    </div>
    {disabled && <p className="mt-1 text-xs text-amber-800">{copy.saveBeforeAdding}</p>}
    {message && <p role="alert" className="mt-1 text-sm text-red-700">{message}</p>}
    {choice ? <form className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2" onSubmit={event => { event.preventDefault(); add(); }}>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{choice.name}</span>
      <input ref={quantityRef} aria-label={text.quantity} className="h-11 w-24 rounded border border-zinc-300 bg-white px-2 text-sm" type="number" min="0.001" max="999999" step="0.001" required value={quantity} disabled={pending || disabled} onFocus={event => event.currentTarget.select()} onChange={event => setQuantity(event.target.value)} />
      <button className="inline-flex min-h-11 items-center gap-1 rounded bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-40" disabled={pending || disabled} type="submit"><Plus className="size-4" />{pending ? copy.savingShort : text.add}</button>
      <button aria-label={text.cancel} className="inline-flex size-11 items-center justify-center" type="button" disabled={pending} onClick={close}><X className="size-4" /></button>
    </form> : open && !disabled && (queryText.length >= 2 || serviceMode) ? <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-[min(55dvh,26rem)] overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg">
      <p className="px-3 py-1 text-xs text-zinc-500">{searching ? text.searching : text.hint}</p>
      <div role="listbox" id="estimate-quick-results" aria-label={text.search}>
        {choices.map((item, index) => <button type="button" role="option" aria-selected={active === index} id={`estimate-quick-option-${index}`} key={item.id} className={`block min-h-14 w-full border-t border-zinc-100 px-3 py-2 text-left ${active === index ? "bg-emerald-50" : "hover:bg-zinc-50"}`} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>
          <span className="block truncate text-sm font-semibold">{item.name}</span>
          <span className="block text-xs text-zinc-500">{[item.sku, item.price ?? copy.pricePending, item.stock].filter(Boolean).join(" · ")}</span>
          {!serviceMode && estimate.lines.some(line => line.sectionId === sectionId && line.productId === item.id) ? <span className="block text-xs text-emerald-800">{text.existing}</span> : null}
        </button>)}
      </div>
      {!searching && !choices.length && <p className="p-3 text-sm text-zinc-500">{text.empty}</p>}
      <button className="min-h-11 w-full border-t border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-emerald-800" type="button" onClick={() => { setOpen(false); onExternal(); }}>{text.external}</button>
    </div> : null}
  </div>;
}
