import Link from "next/link";

import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductCardDto } from "../services";
import { CatalogCardImage } from "./CatalogCardImage";
import { CatalogQuantityCartAction } from "./CatalogQuantityCartAction";
import { ProductPricingBlock } from "./ProductPricingBlock";
import { AddToPurchasingListButton } from "../../purchasing-lists/components/AddToPurchasingListButton";

type ProductCardProps = { product: CatalogProductCardDto; commercialView?: ProductCommercialViewDto; capabilities: ProductCardCapabilityModel; imagePriority?: boolean };

export function ProductCard({ capabilities, commercialView, imagePriority = false, product }: ProductCardProps) {
  const stockTone = getStockTone(commercialView?.stock?.status);
  return <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm transition hover:border-emerald-500">
    <Link className="relative block aspect-[4/3] overflow-hidden bg-zinc-100" href={`/cabinet/catalog/${product.slug}`} prefetch={false}><CatalogCardImage alt={product.name} priority={imagePriority} sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, (max-width: 1535px) 25vw, 20vw" src={product.imageUrl} /></Link>
    <div className="flex flex-1 flex-col p-3">
      <p className="text-[11px] font-medium uppercase text-zinc-500">SKU {product.sku}</p>
      <Link className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-zinc-950 hover:text-emerald-700" href={`/cabinet/catalog/${product.slug}`} prefetch={false}>{product.name}</Link>
      <div className="mt-auto grid gap-2 pt-3 text-sm">
        {capabilities.showPrice && <ProductPricingBlock commercialView={commercialView} />}
        {capabilities.showStock && <div className={`min-h-9 rounded-md px-2 py-1.5 font-medium ${stockTone.card}`}><span className={`inline-flex whitespace-pre-line text-xs font-semibold ${stockTone.text}`}>{commercialView?.stock?.label ?? "Наличие уточняется"}</span></div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2.5">{capabilities.canAddToOrder ? <CatalogQuantityCartAction productId={product.id} /> : <Link className="inline-flex h-9 items-center text-xs font-semibold text-emerald-700" href={`/cabinet/catalog/${product.slug}`} prefetch={false}>Подробнее</Link>}{capabilities.canManagePurchasingLists ? <AddToPurchasingListButton compact productId={product.id} /> : null}</div>
    </div>
  </article>;
}

function getStockTone(status: ProductCommercialViewDto["stock"] extends infer T ? T extends { status: infer S } ? S | undefined : undefined : undefined) { switch (status) { case "in_stock": return { card: "bg-emerald-50", text: "text-emerald-800" }; case "low_stock": return { card: "bg-amber-50", text: "text-amber-900" }; case "expected": return { card: "bg-sky-50", text: "text-sky-900" }; case "out_of_stock": return { card: "bg-rose-50", text: "text-rose-900" }; default: return { card: "bg-zinc-50", text: "text-zinc-700" }; } }
