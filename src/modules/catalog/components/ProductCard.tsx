import Link from "next/link";

import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductCardDto } from "../services";

type ProductCardProps = {
  product: CatalogProductCardDto;
  commercialView?: ProductCommercialViewDto;
};

export function ProductCard({ commercialView, product }: ProductCardProps) {
  return (
    <Link className="block h-full" href={`/cabinet/catalog/${product.slug}`}>
      <article className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:border-emerald-500">
        <div className="flex aspect-[4/3] items-center justify-center rounded-t-lg bg-zinc-100 p-4">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={product.name}
              className="max-h-full max-w-full object-contain"
              src={product.imageUrl}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-zinc-300 text-center text-sm font-medium text-zinc-500">
              Product image
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
            <span>{product.brand?.name ?? "Brand pending"}</span>
            <span aria-hidden="true">/</span>
            <span>{product.category?.name ?? "Category pending"}</span>
          </div>
          <h2 className="mt-3 text-base font-semibold leading-6 text-zinc-950">
            {product.name}
          </h2>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-emerald-700">
            {product.sku}
          </p>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600">
            {product.shortDescription ?? "Catalog description pending."}
          </p>
          <div className="mt-auto grid gap-2 pt-5 text-sm">
            <div className="rounded-md bg-emerald-50 px-3 py-2 font-medium text-emerald-800">
              {commercialView?.price?.label ?? "Price available on request"}
            </div>
            <div className="rounded-md bg-zinc-50 px-3 py-2 text-zinc-700">
              {commercialView?.stock?.label ?? "Check availability"}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
