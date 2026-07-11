import Link from "next/link";

import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { CatalogProductCardDto } from "../services";

type ProductCardProps = {
  product: CatalogProductCardDto;
  commercialView?: ProductCommercialViewDto;
  capabilities: ProductCardCapabilityModel;
  priceTypeName: string | null;
};

export function ProductCard({ capabilities, commercialView, priceTypeName, product }: ProductCardProps) {
  const stockTone = getStockTone(commercialView?.stock?.status);

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
            {capabilities.showPrice && (
              <div className="rounded-md bg-emerald-50 px-3 py-2 font-medium text-emerald-800">
                <p>{commercialView?.price?.label ?? "Цена по запросу"}</p>
                {priceTypeName && <p className="mt-1 text-xs font-normal text-emerald-700">Вид цены: {priceTypeName}</p>}
              </div>
            )}
            {capabilities.showStock && <div
              className={`rounded-md px-3 py-2 font-medium ${stockTone.card}`}
            >
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stockTone.badge}`}
              >
                {commercialView?.stock?.label ?? "Уточнить наличие"}
              </span>
              {commercialView?.stock ? (
                <p className="mt-2 text-xs font-normal">
                  {capabilities.showWarehouseAvailability ? `${commercialView.stock.warehouseCount} склад(а)` : "Наличие доступно"}
                  {commercialView.stock.lastUpdatedAt
                    ? ` / обновлено ${formatDate(commercialView.stock.lastUpdatedAt)}`
                    : ""}
                </p>
              ) : null}
              {commercialView?.stock && capabilities.showExpectedArrival && commercialView.stock.expectedQuantity !== null && (
                <p className="mt-1 text-xs font-normal">Ожидается: {commercialView.stock.expectedQuantity}{commercialView.stock.expectedAt ? `, ${formatDate(commercialView.stock.expectedAt)}` : ""}</p>
              )}
            </div>}
          </div>
        </div>
      </article>
    </Link>
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
        card: "bg-emerald-50 text-emerald-800",
        badge: "bg-emerald-600 text-white",
      };
    case "low_stock":
      return {
        card: "bg-amber-50 text-amber-900",
        badge: "bg-amber-500 text-white",
      };
    case "expected":
      return {
        card: "bg-sky-50 text-sky-900",
        badge: "bg-sky-600 text-white",
      };
    case "out_of_stock":
      return {
        card: "bg-rose-50 text-rose-900",
        badge: "bg-rose-600 text-white",
      };
    default:
      return {
        card: "bg-zinc-50 text-zinc-700",
        badge: "bg-zinc-200 text-zinc-700",
      };
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
