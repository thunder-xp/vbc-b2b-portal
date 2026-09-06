import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";

import { CatalogCardImage } from "../../catalog/components/CatalogCardImage";
import { formatPartnerDate, procurementCopy, procurementProductStateLabel, type PartnerLocale } from "../../partner-locale";
import type { PurchasingListLineDto } from "../types";
import { listIconButton, listInput } from "./purchasing-list-presentation";

export function PurchasingListProductRow({ line, locale, editable, selected, first, last, onSelect, onQuantity, onMove }: {
  line: PurchasingListLineDto;
  locale: PartnerLocale;
  editable: boolean;
  selected: boolean;
  first: boolean;
  last: boolean;
  onSelect: (checked: boolean) => void;
  onQuantity: (quantity: number) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const copy = procurementCopy(locale);
  return <li className="grid grid-cols-[44px_52px_minmax(0,1fr)] items-center gap-x-2 gap-y-2 p-3 xl:grid-cols-[44px_52px_minmax(0,1fr)_112px_136px_120px_88px] xl:gap-x-3" data-product-row>
    <label className="inline-flex size-11 cursor-pointer items-center justify-center self-start xl:self-center">
      <input aria-label={`${copy.select}: ${line.productName}`} checked={selected} className="size-4 accent-emerald-700" onChange={(event) => onSelect(event.target.checked)} type="checkbox" />
    </label>
    <div className="relative size-[52px] overflow-hidden rounded border border-zinc-200 bg-zinc-50" data-row-image>
      <CatalogCardImage alt={line.productName} sizes="52px" src={line.imageUrl} />
    </div>
    <div className="min-w-0" data-row-identity>
      <Link className="block break-words text-sm font-semibold leading-5 text-zinc-950 hover:text-emerald-700" href={line.slug ? `/cabinet/catalog/${line.slug}` : "/cabinet/catalog"}>{line.productName}</Link>
      <p className="mt-0.5 text-xs text-zinc-500">{line.sku}</p>
      {line.state !== "available" ? <p className="mt-0.5 text-xs font-medium text-amber-700">{procurementProductStateLabel(locale, line.state)}</p> : null}
    </div>
    <label className="col-span-2 row-start-3 text-xs text-zinc-500 xl:col-span-1 xl:row-start-auto xl:self-start" data-row-quantity>
      {copy.quantity}
      <input className={`${listInput} mt-1`} disabled={!editable} max={9999} min={1} onChange={(event) => onQuantity(Number(event.target.value))} type="number" value={line.quantity} />
    </label>
    <div className="col-span-2 col-start-1 row-start-2 min-w-0 text-xs xl:col-span-1 xl:col-start-auto xl:row-start-auto xl:self-start" data-row-price>
      <span className="block text-zinc-500">{line.currentPartnerPrice ? copy.partnerPrice : copy.retailPrice}</span>
      <p className="mt-1 text-sm font-semibold text-zinc-950 xl:flex xl:min-h-11 xl:items-center">{line.currentPartnerPrice ?? line.currentRetailPrice ?? copy.priceUnavailable}</p>
    </div>
    <div className="col-start-3 row-start-2 min-w-0 text-xs xl:col-start-auto xl:row-start-auto xl:self-start" data-row-stock>
      <span className="block text-zinc-500">{copy.availability}</span>
      <p className="mt-1 text-sm text-zinc-950 xl:flex xl:min-h-11 xl:items-center">{line.availableStock ?? copy.pending}</p>
      {line.expectedArrivalDate ? <p className="text-xs text-zinc-500">{copy.arrival}: {formatPartnerDate(line.expectedArrivalDate, locale)}</p> : null}
    </div>
    <div className="col-start-3 row-start-3 flex justify-end self-end xl:col-start-auto xl:row-start-auto xl:self-center" data-row-actions>
      {editable ? <>
        <button aria-label={copy.moveUp} className={listIconButton} disabled={first} onClick={() => onMove(-1)} title={copy.moveUp} type="button"><ArrowUp aria-hidden="true" className="size-4" /></button>
        <button aria-label={copy.moveDown} className={listIconButton} disabled={last} onClick={() => onMove(1)} title={copy.moveDown} type="button"><ArrowDown aria-hidden="true" className="size-4" /></button>
      </> : null}
    </div>
  </li>;
}
