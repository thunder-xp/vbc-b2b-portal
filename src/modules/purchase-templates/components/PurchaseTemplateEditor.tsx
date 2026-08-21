"use client";

import { Archive, ArrowDown, ArrowUp, Copy, PackageSearch, Save, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { searchCatalogSuggestionsAction } from "../../catalog/actions";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { CatalogCardImage } from "../../catalog/components/CatalogCardImage";
import { addPurchaseTemplateToCartAction, archivePurchaseTemplateAction, copyPurchaseTemplateAction, updatePurchaseTemplateAction } from "../actions";
import type { PurchaseTemplateDetailDto } from "../types";
import { formatPartnerDate, procurementCopy, purchaseTemplateLineStateLabel, usePartnerLocale } from "../../partner-locale";

type EditableLine = PurchaseTemplateDetailDto["lines"][number];

export function PurchaseTemplateEditor({ initial }: { initial: PurchaseTemplateDetailDto }) {
  const locale = usePartnerLocale();
  const copy = procurementCopy(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState(initial.lines);
  const [revision, setRevision] = useState(initial.revision);
  const [selected, setSelected] = useState(() => new Set(initial.lines.filter((line) => line.eligible).map((line) => line.id)));
  const [multiplier, setMultiplier] = useState<0.5 | 1 | 2 | 3>(1);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; sku: string; name: string }>>([]);
  const [cartKey, setCartKey] = useState(() => crypto.randomUUID());
  const [copyKey, setCopyKey] = useState(() => crypto.randomUUID());
  const invalidHalf = useMemo(() => multiplier === 0.5 && lines.some((line) => selected.has(line.id) && !Number.isInteger(line.preferredQuantity * multiplier)), [lines, multiplier, selected]);
  const selectedEligible = lines.filter((line) => selected.has(line.id) && line.eligible).length;

  const run = (operation: () => Promise<{ success: boolean; message: string; data: unknown }>, done?: (data: unknown) => void) => startTransition(async () => {
    const result = await operation();
    setMessage(result.success ? copy.operationComplete : copy.operationError);
    if (result.success) done?.(result.data);
  });

  return <div className="space-y-6">
    <form className="grid gap-4 border-b border-zinc-200 pb-5 md:grid-cols-2" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      run(() => updatePurchaseTemplateAction({ templateId: initial.id, expectedRevision: revision, name: String(data.get("name")), description: String(data.get("description")), visibility: String(data.get("visibility")) as "private" | "company", items: lines.map((line, index) => ({ productId: line.productId, preferredQuantity: line.preferredQuantity, lineNote: line.lineNote, sortOrder: index + 1 })) }), (value) => { recordBehaviorInteraction({ eventName: "purchase_template_edited", route: "/cabinet/purchase-templates/detail", sourceSurface: "purchase_template_editor" }); setRevision((value as { revision: number }).revision); router.refresh(); });
    }}>
      <label className="text-sm">{copy.name}<input className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" defaultValue={initial.name} disabled={!initial.canEdit} name="name" required /></label>
      <label className="text-sm">{copy.access}<select className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-3" defaultValue={initial.visibility} disabled={!initial.canEdit} name="visibility"><option value="private">{copy.private}</option><option value="company">{copy.company}</option></select></label>
      <label className="text-sm md:col-span-2">{copy.description}<textarea className="mt-1 min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2" defaultValue={initial.description ?? ""} disabled={!initial.canEdit} name="description" /></label>
      {initial.canEdit ? <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white md:w-fit" disabled={pending} type="submit"><Save className="size-4" />{copy.saveChanges}</button> : null}
    </form>

    {initial.canEdit && initial.status === "active" ? <section aria-labelledby="template-product-search">
      <h2 className="text-base font-semibold" id="template-product-search">{copy.addProduct}</h2>
      <form className="mt-2 flex max-w-2xl gap-2" onSubmit={(event) => { event.preventDefault(); startTransition(async () => setSuggestions((await searchCatalogSuggestionsAction({ query: search })).map(({ id, sku, name }) => ({ id, sku, name })))); }}>
        <label className="sr-only" htmlFor="template-search">{copy.skuOrName}</label><input className="h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3" id="template-search" onChange={(event) => setSearch(event.target.value)} placeholder={copy.skuOrName} value={search} /><button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold" disabled={pending || search.trim().length < 2} type="submit"><PackageSearch className="size-4" />{copy.find}</button>
      </form>
      {suggestions.length ? <ul className="mt-2 max-w-2xl divide-y divide-zinc-200 border border-zinc-200 bg-white">{suggestions.map((product) => <li className="flex min-h-14 items-center justify-between gap-3 px-3 py-2" key={product.id}><span className="min-w-0"><strong className="block truncate text-sm">{product.name}</strong><span className="text-xs text-zinc-500">{product.sku}</span></span><button className="min-h-11 shrink-0 rounded-md border border-zinc-300 px-3 text-sm font-semibold" onClick={() => { if (!lines.some((line) => line.productId === product.id)) setLines((current) => [...current, createLine(product, initial.id, current.length + 1, copy.saveForValidation)]); setSuggestions([]); setSearch(""); }} type="button">{copy.add}</button></li>)}</ul> : null}
    </section> : null}

    <section aria-labelledby="template-preview">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold" id="template-preview">{copy.currentConditions}</h2><p className="mt-1 text-sm text-zinc-600">{copy.conditionsHint}</p></div><label className="text-sm font-medium">{copy.multiplier}<select className="ml-2 h-11 rounded-md border border-zinc-300 px-3" onChange={(event) => setMultiplier(Number(event.target.value) as 0.5 | 1 | 2 | 3)} value={multiplier}><option value={0.5}>×0.5</option><option value={1}>×1</option><option value={2}>×2</option><option value={3}>×3</option></select></label></div>
      <Summary detail={initial} />
      {invalidHalf ? <p className="mt-3 text-sm text-amber-800" role="status">{copy.halfUnavailable}</p> : null}
    </section>

    {!lines.length ? <div className="border border-dashed border-zinc-300 bg-white px-5 py-10 text-center"><p className="font-semibold">{copy.templateEmpty}</p><Link className="mt-3 inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href="/cabinet/catalog" prefetch={false}>{copy.openCatalog}</Link></div> : <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white">{lines.map((line, index) => <li className="grid gap-3 p-4 md:grid-cols-[28px_64px_minmax(180px,1fr)_120px_150px_150px_96px] md:items-center" key={line.id}>
      <input aria-label={`${copy.selectProduct}: ${line.productName ?? copy.product}`} checked={selected.has(line.id)} className="size-5 accent-emerald-700" disabled={!line.eligible} onChange={(event) => setSelected((current) => toggle(current, line.id, event.target.checked))} type="checkbox" />
      <div className="relative aspect-square overflow-hidden rounded border border-zinc-200 bg-zinc-50"><CatalogCardImage alt={line.productName ?? copy.product} sizes="64px" src={line.imageUrl} /></div>
      <div className="min-w-0">{line.slug ? <Link className="line-clamp-2 font-semibold hover:text-emerald-700" href={`/cabinet/catalog/${line.slug}`} prefetch={false}>{line.productName}</Link> : <p className="font-semibold">{line.state === "access_restricted" ? copy.restrictedProduct : copy.unavailableProduct}</p>}<p className="text-xs text-zinc-500">{line.sku ?? copy.hiddenData}</p><p className={`mt-1 text-xs font-semibold ${line.eligible ? "text-emerald-700" : "text-amber-800"}`}>{purchaseTemplateLineStateLabel(locale, line.state)}</p>{line.expectedArrivalDate ? <p className="mt-1 text-xs text-zinc-500">{copy.arrival}: {formatPartnerDate(line.expectedArrivalDate, locale)}</p> : null}</div>
      <label className="text-xs text-zinc-500">{copy.quantity}<input aria-label={`${copy.quantity}: ${line.productName ?? copy.product}`} className="mt-1 h-11 w-full rounded-md border border-zinc-300 px-2 text-sm" disabled={!initial.canEdit} max={9999} min={1} onChange={(event) => updateLine(setLines, line.id, { preferredQuantity: Number(event.target.value) })} type="number" value={line.preferredQuantity} /></label>
      <div className="text-sm"><span className="text-xs text-zinc-500">{copy.currentPrice}</span><p className="font-semibold">{line.currentUnitPrice ?? copy.pricePending}</p>{line.lineTotal ? <p className="text-xs text-zinc-500">{copy.totalAmount}: {line.lineTotal}</p> : null}</div>
      <div className="text-sm"><span className="text-xs text-zinc-500">{copy.availability}</span><p>{line.availableQuantity === null ? copy.pending : `${line.availableQuantity} ${copy.units}`}</p></div>
      <div className="flex items-center justify-end gap-1">{initial.canEdit ? <><button aria-label={copy.moveUp} className="grid size-11 place-items-center" disabled={index === 0} onClick={() => setLines((current) => move(current, index, -1))} type="button"><ArrowUp className="size-4" /></button><button aria-label={copy.moveDown} className="grid size-11 place-items-center" disabled={index === lines.length - 1} onClick={() => setLines((current) => move(current, index, 1))} type="button"><ArrowDown className="size-4" /></button><button aria-label={copy.removePosition} className="grid size-11 place-items-center text-rose-700" onClick={() => { setLines((current) => current.filter((item) => item.id !== line.id)); setSelected((current) => toggle(current, line.id, false)); }} type="button"><Trash2 className="size-4" /></button></> : null}</div>
      {initial.canEdit ? <label className="md:col-start-3 md:col-span-4 text-xs text-zinc-500">{copy.note}<input className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-2 text-sm" maxLength={500} onChange={(event) => updateLine(setLines, line.id, { lineNote: event.target.value || null })} value={line.lineNote ?? ""} /></label> : null}
    </li>)}</ul>}

    <div className="sticky bottom-3 flex flex-wrap items-center gap-2 border border-zinc-200 bg-white p-3 shadow-lg">
      {initial.status === "active" ? <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-zinc-300" disabled={pending || selectedEligible === 0 || invalidHalf} onClick={() => { recordBehaviorInteraction({ eventName: "purchase_template_previewed", route: "/cabinet/purchase-templates/detail", sourceSurface: "purchase_template_preview" }); run(() => addPurchaseTemplateToCartAction({ templateId: initial.id, requestKey: cartKey, multiplier, selections: lines.filter((line) => selected.has(line.id) && line.eligible).map((line) => ({ itemId: line.id, quantity: line.preferredQuantity * multiplier })) }), () => { recordBehaviorInteraction({ eventName: "purchase_template_added_to_cart", route: "/cabinet/purchase-templates/detail", sourceSurface: "purchase_template_execution" }); setCartKey(crypto.randomUUID()); router.refresh(); }); }} type="button"><ShoppingCart className="size-4" />{copy.validateAndAdd}</button> : null}
      <button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold" disabled={pending} onClick={() => run(() => copyPurchaseTemplateAction(initial.id, copyKey), (data) => { recordBehaviorInteraction({ eventName: "purchase_template_copied", route: "/cabinet/purchase-templates/detail", sourceSurface: "purchase_template_editor" }); setCopyKey(crypto.randomUUID()); router.push(`/cabinet/purchase-templates/${(data as { id: string }).id}`); })} type="button"><Copy className="size-4" />{copy.createCopy}</button>
      {initial.canEdit && initial.status === "active" ? <button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-rose-700" disabled={pending} onClick={() => run(() => archivePurchaseTemplateAction(initial.id, revision), () => { recordBehaviorInteraction({ eventName: "purchase_template_archived", route: "/cabinet/purchase-templates/detail", sourceSurface: "purchase_template_editor" }); router.push("/cabinet/purchase-templates?filter=archived"); })} type="button"><Archive className="size-4" />{copy.archiveAction}</button> : null}
      {message ? <p className="w-full text-sm text-zinc-700" role="status">{message}</p> : null}
    </div>
  </div>;
}

function Summary({ detail }: { detail: PurchaseTemplateDetailDto }) { const copy = procurementCopy(usePartnerLocale()); const items = [[copy.positionsTotal, detail.summary.totalPositions], [copy.available, detail.summary.eligible], [copy.expected, detail.summary.expected], [copy.outOfStock, detail.summary.unavailable], [copy.pricePending, detail.summary.priceUnavailable], [copy.unavailableShort, detail.summary.unpublished + detail.summary.restricted]]; return <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden border border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-6">{items.map(([label, value]) => <div className="bg-white p-3" key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>)}</div>; }
function toggle(current: Set<string>, id: string, enabled: boolean) { const next = new Set(current); if (enabled) next.add(id); else next.delete(id); return next; }
function updateLine(setter: React.Dispatch<React.SetStateAction<EditableLine[]>>, id: string, patch: Partial<EditableLine>) { setter((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line)); }
function move(lines: EditableLine[], index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= lines.length) return lines; const next = [...lines]; [next[index], next[target]] = [next[target], next[index]]; return next; }
function createLine(product: { id: string; sku: string; name: string }, templateId: string, order: number, stateLabel: string): EditableLine { const now = new Date().toISOString(); return { id: crypto.randomUUID(), templateId, productId: product.id, preferredQuantity: 1, lineNote: null, sortOrder: order, createdAt: now, updatedAt: now, sku: product.sku, productName: product.name, slug: null, imageUrl: null, currentUnitPrice: null, currentUnitPriceAmount: null, currentCurrencyCode: null, lineTotal: null, availableQuantity: null, expectedArrivalDate: null, expectedArrivalQuantity: null, state: "price_unavailable", stateLabel, eligible: false }; }
