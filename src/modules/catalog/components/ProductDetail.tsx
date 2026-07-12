import Link from "next/link";

import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductDetailDto } from "../services";

import { ProductImageGallery } from "./ProductImageGallery";
import { ProductPricingBlock } from "./ProductPricingBlock";

type ProductDetailProps = {
  commercialView?: ProductCommercialViewDto;
  product: CatalogProductDetailDto;
};

export function ProductDetail({ commercialView, product }: ProductDetailProps) {
  const stockTone = getStockTone(commercialView?.stock?.status);

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
          <ProductPricingBlock commercialView={commercialView} />
          <div className={`rounded-lg border p-4 ${stockTone.panel}`}>
            <h2 className="text-sm font-semibold text-zinc-950">
              Stock Availability
            </h2>
            <p
              className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${stockTone.badge}`}
            >
              {commercialView?.stock?.label ?? "Check availability"}
            </p>
            {commercialView?.stock ? (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Available quantity</dt>
                  <dd className="font-semibold text-zinc-950">
                    {commercialView.stock.availableQuantity}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Warehouses</dt>
                  <dd className="font-semibold text-zinc-950">
                    {commercialView.stock.warehouseCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Expected</dt>
                  <dd className="font-semibold text-zinc-950">
                    {commercialView.stock.expectedQuantity
                      ? `${commercialView.stock.expectedQuantity}`
                      : "None"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Last updated</dt>
                  <dd className="font-semibold text-zinc-950">
                    {commercialView.stock.lastUpdatedAt
                      ? formatDateTime(commercialView.stock.lastUpdatedAt)
                      : "Pending"}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        </section>

        {product.keyCharacteristics.length > 0 && <section className="mt-8 border-t border-zinc-200 pt-6"><h2 className="text-base font-semibold text-zinc-950">Characteristics</h2><dl className="mt-3 divide-y divide-zinc-100 rounded-md border border-zinc-200">{product.keyCharacteristics.map((item) => <div className="grid grid-cols-2 gap-4 px-4 py-3 text-sm" key={item.label}><dt className="text-zinc-500">{item.label}</dt><dd className="font-medium text-zinc-950">{item.value}</dd></div>)}</dl></section>}

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

function getStockTone(status: ProductCommercialViewDto["stock"] extends infer T
  ? T extends { status: infer S }
    ? S | undefined
    : undefined
  : undefined) {
  switch (status) {
    case "in_stock":
      return {
        panel: "border-emerald-100 bg-emerald-50",
        badge: "bg-emerald-600 text-white",
      };
    case "low_stock":
      return {
        panel: "border-amber-100 bg-amber-50",
        badge: "bg-amber-500 text-white",
      };
    case "expected":
      return {
        panel: "border-sky-100 bg-sky-50",
        badge: "bg-sky-600 text-white",
      };
    case "out_of_stock":
      return {
        panel: "border-rose-100 bg-rose-50",
        badge: "bg-rose-600 text-white",
      };
    default:
      return {
        panel: "border-zinc-200 bg-zinc-50",
        badge: "bg-zinc-200 text-zinc-700",
      };
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
