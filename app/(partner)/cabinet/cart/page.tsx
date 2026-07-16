import Link from "next/link";

import { getCartAction } from "@/src/modules/orders/actions";
import { CartItemActions, OrderSubmitForm } from "@/src/modules/orders/components";
import { CreateEstimateFromCartButton } from "@/src/modules/estimates/components";

export default async function CartPage() {
  const result = await getCartAction();

  if (!result.success) {
    return <PageMessage title="Корзина недоступна" message={result.message} />;
  }

  const cart = result.data;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase text-emerald-700">Оформление заказа</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Корзина</h1>
      </header>

      {cart.lines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">Корзина пуста</h2>
          <p className="mt-2 text-sm text-zinc-600">Добавьте товары из каталога, чтобы создать заказ в 1С.</p>
          <Link className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" href="/cabinet/catalog">Открыть каталог</Link>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <ul className="divide-y divide-zinc-200">
              {cart.lines.map((line) => (
                <li className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_150px_180px]" key={line.id}>
                  <div>
                    <Link className="font-semibold text-zinc-950 hover:text-emerald-700" href={`/cabinet/catalog/${line.slug}`}>{line.productName}</Link>
                    <p className="mt-1 text-xs text-zinc-500">Артикул: {line.sku}</p>
                    <p className="mt-3 text-sm">Партнёрская цена: <strong>{line.partnerUnitPrice ?? "Недоступна"}</strong></p>
                    <p className="mt-1 text-xs text-zinc-600">Доступно: {line.availableStock ?? "Нет данных"}</p>
                    {line.nearestArrivalDate && <p className="mt-1 text-xs text-zinc-600">Поступление: {line.nearestArrivalDate}{line.nearestArrivalQuantity !== null ? `, ${line.nearestArrivalQuantity} шт.` : ""}</p>}
                  </div>
                  <div className="text-sm"><span className="text-zinc-500">Сумма</span><p className="mt-1 font-semibold">{line.partnerLineTotal ?? "Недоступна"}</p></div>
                  <CartItemActions itemId={line.id} quantity={line.quantity} />
                </li>
              ))}
            </ul>
          </div>
          <aside className="space-y-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-sm text-zinc-600">Позиций</p>
              <p className="mt-1 text-xl font-semibold">{cart.positionCount}</p>
              <p className="mt-3 text-sm text-zinc-600">Единиц товара</p>
              <p className="mt-1 text-lg font-semibold">{cart.totalUnitCount}</p>
              <p className="mt-4 text-sm text-zinc-600">Итого</p>
              <p className="mt-1 text-xl font-semibold">{cart.total ?? "Требуется актуальная цена"}</p>
            </div>
            <CreateEstimateFromCartButton />
            <OrderSubmitForm submissionKey={crypto.randomUUID()} />
          </aside>
        </div>
      )}
    </div>
  );
}

function PageMessage({ title, message }: { title: string; message: string }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-5"><h1 className="font-semibold text-rose-950">{title}</h1><p className="mt-2 text-sm text-rose-800">{message}</p></div>;
}
