import { PackagePlus } from "lucide-react";
import Link from "next/link";

import { ProductCard } from "@/src/modules/catalog/components";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import { CATALOG_PRODUCT_GRID_CLASS } from "@/src/modules/catalog/components/ProductGrid";
import { getCurrentWarehouseReplenishmentAction } from "@/src/modules/warehouse-arrivals";

export default async function WarehouseReplenishmentPage() {
  const result = await getCurrentWarehouseReplenishmentAction();
  if (!result.success) {
    return <EmptyCatalog
      message="Обновите страницу или попробуйте немного позже."
      title="Пополнение временно недоступно"
    />;
  }
  const commercialViews = new Map(result.data.commercialViews.map((view) => [view.productId, view]));
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase text-sky-700"><PackagePlus aria-hidden="true" className="size-4" />Каталог товаров</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950 sm:text-3xl">Пополнение</h1>
        <p className="mt-2 text-sm text-zinc-600">Последнее поступление на склад</p>
      </div>
      <Link className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-emerald-700 hover:text-emerald-800" href="/cabinet/catalog">Вернуться в каталог</Link>
    </header>
    {result.data.products.length ? <div className={CATALOG_PRODUCT_GRID_CLASS}>
      {result.data.products.map((product) => <ProductCard
        analyticsSurface="warehouse_replenishment"
        capabilities={result.data.productCardCapabilities}
        commercialView={commercialViews.get(product.id)}
        companyId={result.data.companyId}
        contextBadge="ПОПОЛНЕНИЕ"
        key={product.id}
        product={product}
        userId={result.data.userId}
      />)}
    </div> : <section className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      <h2 className="font-semibold text-zinc-950">Пополнение пока не опубликовано</h2>
      <p className="mt-1 text-sm text-zinc-600">Актуальные товары появятся здесь после следующего подтвержденного поступления.</p>
    </section>}
  </div>;
}
