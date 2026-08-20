import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductCard } from "@/src/modules/catalog/components/ProductCard";
import { ArrivalSeenMarker, getWarehouseArrivalPageDataAction } from "@/src/modules/warehouse-arrivals";

export default async function WarehouseArrivalDetailPage({ params }: { params: Promise<{ arrivalId: string }> }) {
  const { arrivalId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(arrivalId)) notFound();
  const result = await getWarehouseArrivalPageDataAction(arrivalId);
  if (!result.success || !result.data) notFound();
  const { arrival, companyId, productCardCapabilities, userId } = result.data;
  const commercialByProduct = new Map(arrival.commercialViews.map((item) => [item.productId, item]));
  return <div className="space-y-6">
    <ArrivalSeenMarker arrivalId={arrival.id} seen={arrival.seen} />
    <header className="border-b border-zinc-200 pb-5">
      <Link className="text-sm font-semibold text-sky-700" href="/cabinet/arrivals">← Все поступления</Link>
      <p className="mt-5 text-xs font-semibold uppercase text-sky-700">Пополнение</p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-950 sm:text-3xl">Пополнение склада</h1>
      <p className="mt-2 text-sm text-zinc-600">{formatDate(arrival.completedAt)} · {arrival.products.length} позиций</p>
    </header>
    <section aria-labelledby="arrival-products">
      <h2 className="text-xl font-semibold" id="arrival-products">Товары поступления</h2>
      <p className="mt-1 text-sm text-zinc-600">Цены и наличие показаны по текущим подтверждённым данным каталога.</p>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {arrival.products.map((product) => <ProductCard
          analyticsSurface="warehouse_arrival"
          capabilities={productCardCapabilities}
          commercialView={commercialByProduct.get(product.id)}
          companyId={companyId}
          contextBadge="Пополнение"
          key={product.id}
          product={product}
          userId={userId}
        />)}
      </div>
    </section>
  </div>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date(value)); }
