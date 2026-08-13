import { ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { availabilityCopy, availabilityTone, formatRetailCardPrice, retailCopy } from "../presentation";
import type { PublicRetailLocale, PublicRetailProductSummaryDto } from "../types";
import { PublicRetailAddToCartButton } from "./PublicRetailAddToCartButton";

export function PublicRetailProductCard({ product, locale, badge }: { product: PublicRetailProductSummaryDto; locale: PublicRetailLocale; badge?: string }) {
  const copy = retailCopy[locale];
  return <article className="group grid h-full min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr_auto_auto] overflow-hidden border border-zinc-200 bg-white transition-[border-color,box-shadow] duration-200 hover:border-zinc-300 hover:shadow-sm">
    <Link className="relative block h-32 w-full min-w-0 max-w-full overflow-hidden bg-zinc-50 sm:h-40 xl:h-44 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" href={`/products/${product.slug}?lang=${locale}`}>
      {badge ? <span className="absolute left-2 top-2 z-10 inline-flex min-h-6 max-w-[calc(100%-1rem)] items-center border border-zinc-200 bg-white/95 px-2 text-[10px] font-semibold text-zinc-700 shadow-sm">{badge}</span> : null}
      {product.image ? <Image alt={product.image.alt || product.name} className="size-full max-h-full max-w-full object-contain p-4 transition-transform duration-200 group-hover:scale-[1.02]" fill loading="lazy" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw" src={product.image.url} /> : <span className="grid size-full max-h-full max-w-full place-items-center overflow-hidden text-zinc-300"><ImageIcon aria-hidden="true" className="size-12" /><span className="sr-only">{locale === "ro" ? "Imagine indisponibilă" : "Изображение отсутствует"}</span></span>}
    </Link>
    <div className="min-w-0 px-3 pt-3 sm:px-4"><p className="truncate text-[11px] font-semibold uppercase text-zinc-500" title={product.brand?.name ?? product.category?.name ?? "Novotech"}>{product.brand?.name ?? product.category?.name ?? "Novotech"}</p><p className="mt-1 truncate text-xs text-zinc-400" title={`${copy.sku}: ${product.sku}`}>{copy.sku}: {product.sku}</p></div>
    <div className="min-w-0 px-3 pt-2 sm:px-4">
      <Link aria-label={product.name} className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-zinc-900 group-hover:text-emerald-800" href={`/products/${product.slug}?lang=${locale}`} title={product.name}>{product.name}</Link>
      <ul className="mt-2 min-h-[3.75rem] space-y-0 text-xs leading-5 text-zinc-600">{product.highlights.slice(0, 3).map((item) => <li className="line-clamp-1" key={item.key}><span className="text-zinc-400">{item.label}:</span> {item.value}</li>)}</ul>
    </div>
    <div className="px-3 pt-3 sm:px-4"><p className={`flex min-h-5 items-center text-xs font-semibold ${availabilityTone(product.availability)}`}>{availabilityCopy[locale][product.availability]}</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatRetailCardPrice(product.price.amount, product.price.currency, locale)}</p><p className="text-[11px] text-zinc-400">{copy.price}</p></div>
    <div className="grid gap-2 p-3 sm:p-4"><PublicRetailAddToCartButton compact locale={locale} publicProductId={product.id} source="catalog" /><Link className="flex min-h-11 items-center justify-center border border-zinc-300 px-3 text-sm font-semibold hover:border-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" href={`/products/${product.slug}?lang=${locale}`}>{copy.details}</Link></div>
  </article>;
}
