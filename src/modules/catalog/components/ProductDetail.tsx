import Link from "next/link";

import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductDetailDto } from "../services";

import { ProductImageGallery } from "./ProductImageGallery";

type ProductDetailProps = {
  commercialView?: ProductCommercialViewDto;
  product: CatalogProductDetailDto;
};

export function ProductDetail({ commercialView, product }: ProductDetailProps) {
  return (
    <article className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <ProductImageGallery
        fallbackImageUrl={product.imageUrl}
        images={product.images}
        productName={product.name}
      />
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <Link className="text-sm font-medium text-emerald-700" href="/cabinet/catalog">
          Back to catalog
        </Link>
        <div className="mt-5 flex flex-wrap gap-2 text-sm text-zinc-500">
          <span>{product.brand?.name ?? "Brand pending"}</span>
          <span aria-hidden="true">/</span>
          <span>{product.category?.name ?? "Category pending"}</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
          {product.name}
        </h1>
        <p className="mt-2 text-sm font-medium uppercase tracking-[0.14em] text-emerald-700">
          {product.sku}
        </p>
        <p className="mt-5 whitespace-pre-line text-sm leading-7 text-zinc-700">
          {product.description ??
            product.shortDescription ??
            "Product description is not available yet."}
        </p>

        <section className="mt-8 grid gap-3 border-t border-zinc-200 pt-6 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
            <h2 className="text-sm font-semibold text-emerald-950">Price</h2>
            <p className="mt-2 text-lg font-semibold text-emerald-800">
              {commercialView?.price?.label ?? "Price available on request"}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <h2 className="text-sm font-semibold text-zinc-950">
              Availability
            </h2>
            <p className="mt-2 text-lg font-semibold text-zinc-800">
              {commercialView?.stock?.label ?? "Check availability"}
            </p>
          </div>
        </section>

        <section className="mt-8 border-t border-zinc-200 pt-6">
          <h2 className="text-base font-semibold text-zinc-950">Documents</h2>
          {product.documents.length > 0 ? (
            <ul className="mt-3 divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {product.documents.map((document) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                  key={document.id}
                >
                  <div>
                    <p className="font-medium text-zinc-950">
                      {document.title}
                    </p>
                    <p className="text-zinc-500">{document.documentType}</p>
                  </div>
                  <a
                    className="font-medium text-emerald-700"
                    href={document.url}
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">
              Product documents are not available yet.
            </p>
          )}
        </section>

        <p className="mt-8 rounded-md bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Contact your Novotech manager for commercial assistance.
        </p>
      </div>
    </article>
  );
}
