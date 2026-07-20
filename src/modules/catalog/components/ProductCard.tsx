import Link from "next/link";

import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductCardDto } from "../services";
import { CatalogCardImage } from "./CatalogCardImage";
import { ProductPricingBlock } from "./ProductPricingBlock";
import { AddToCartButton } from "../../orders/components/AddToCartButton";
import { AddToPurchasingListButton } from "../../purchasing-lists/components/AddToPurchasingListButton";

type ProductCardProps = { product: CatalogProductCardDto; commercialView?: ProductCommercialViewDto; capabilities: ProductCardCapabilityModel; imagePriority?: boolean };

export function ProductCard({ capabilities, commercialView, imagePriority = false, product }: ProductCardProps) {
  const stockTone = getStockTone(commercialView?.stock?.status);
  return <article className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:border-emerald-500">
    <Link className="relative block aspect-[4/3] overflow-hidden rounded-t-lg bg-zinc-100" href={`/cabinet/catalog/${product.slug}`} prefetch={false}><CatalogCardImage alt={product.name} priority={imagePriority} src={product.imageUrl} /></Link>
    <div className="flex flex-1 flex-col p-4">
      <Link className="text-base font-semibold leading-6 text-zinc-950 hover:text-emerald-700" href={`/cabinet/catalog/${product.slug}`} prefetch={false}>{product.name}</Link>
      <p className="mt-1 text-xs font-medium uppercase text-emerald-700">{product.sku}</p>
      <div className="mt-auto grid gap-2 pt-5 text-sm">
        {capabilities.showPrice && <ProductPricingBlock commercialView={commercialView} />}
        {capabilities.showStock && <div className={`rounded-md px-3 py-2 font-medium ${stockTone.card}`}><span className={`inline-flex whitespace-pre-line rounded-md px-2 py-1 text-xs font-semibold ${stockTone.badge}`}>{commercialView?.stock?.label ?? "Наличие уточняется"}</span></div>}
      </div>
      <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-zinc-100 pt-3"><Link className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-500" href={`/cabinet/catalog/${product.slug}`} prefetch={false}>Подробнее</Link>{capabilities.canAddToOrder && <AddToCartButton productId={product.id} />}{capabilities.canManagePurchasingLists && <AddToPurchasingListButton productId={product.id} />}</div>
    </div>
  </article>;
}

function getStockTone(status: ProductCommercialViewDto["stock"] extends infer T ? T extends { status: infer S } ? S | undefined : undefined : undefined) { switch (status) { case "in_stock": return { card: "bg-emerald-50 text-emerald-800", badge: "bg-emerald-600 text-white" }; case "low_stock": return { card: "bg-amber-50 text-amber-900", badge: "bg-amber-500 text-white" }; case "expected": return { card: "bg-sky-50 text-sky-900", badge: "bg-sky-600 text-white" }; case "out_of_stock": return { card: "bg-rose-50 text-rose-900", badge: "bg-rose-600 text-white" }; default: return { card: "bg-zinc-50 text-zinc-700", badge: "bg-zinc-200 text-zinc-700" }; } }
