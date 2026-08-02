import Link from "next/link";

import { ProductLineThumbnail } from "@/src/modules/catalog/components/ProductLineThumbnail";
import { getCartAction } from "@/src/modules/orders/actions";
import { CartItemActions } from "@/src/modules/orders/components/CartItemActions";
import { CartCheckoutCoordinator } from "@/src/modules/orders/components/CartCheckoutCoordinator";
import { OrderSubmitForm } from "@/src/modules/orders/components/OrderSubmitForm";
import { CreateEstimateFromCartButton } from "@/src/modules/estimates/components/CreateEstimateFromCartButton";
import { SaveAsPurchasingListButton } from "@/src/modules/purchasing-lists/components";
import { SaveAsPurchaseTemplateButton } from "@/src/modules/purchase-templates/components";
import type { CartLineDto } from "@/src/modules/orders/services";

const GROUPS: Array<{ key: CartLineDto["availabilityGroup"]; title: string; description: string }> = [
  { key: "available", title: "В наличии", description: "Можно передать в обработку сейчас." },
  { key: "expected", title: "Ожидается к поступлению", description: "Срок поставки будет подтверждён менеджером." },
  { key: "confirmation", title: "Требует подтверждения", description: "Наличие и срок уточнит менеджер Novotech." },
];

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
          <Link className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" href="/cabinet/catalog" prefetch={false}>Открыть каталог</Link>
        </div>
      ) : (
        <CartCheckoutCoordinator>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {GROUPS.map((group) => {
              const lines = cart.lines.filter((line) => line.availabilityGroup === group.key);
              if (!lines.length) return null;
              return <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white" key={group.key}>
                <header className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                  <h2 className="text-sm font-semibold text-zinc-950">{group.title} · {lines.length}</h2>
                  <p className="mt-0.5 text-xs text-zinc-600">{group.description}</p>
                </header>
            <ul className="divide-y divide-zinc-200">
              {lines.map((line) => (
                <li className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_8rem_11.25rem] md:items-center" key={line.id}>
                  <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4rem_minmax(0,1fr)]">
                    <ProductLineThumbnail imageUrl={line.imageUrl} productName={line.productName} />
                    <div className="min-w-0">
                      <Link className="line-clamp-2 font-semibold text-zinc-950 hover:text-emerald-700" href={`/cabinet/catalog/${line.slug}`} prefetch={false}>{line.productName}</Link>
                      <p className="mt-1 text-xs text-zinc-500">Артикул: {line.sku}</p>
                      <p className="mt-2 text-sm">{cart.commercialMode === "full" ? "Ваша цена" : "Розничная цена"}: <strong className="whitespace-nowrap">{cart.commercialMode === "full" ? line.partnerUnitPrice ?? "Цена уточняется" : line.retailUnitPrice ?? "Цена уточняется"}</strong></p>
                      <p className="mt-1 text-xs text-zinc-600">{line.availableStock === null ? "Наличие уточняется" : line.availableStock > 0 ? `В наличии: ${line.availableStock} шт.` : "Нет в наличии"}</p>
                      {line.nearestArrivalDate && <p className="mt-1 text-xs text-zinc-600">Поступление: {line.nearestArrivalDate}{line.nearestArrivalQuantity !== null ? `, ${line.nearestArrivalQuantity} шт.` : ""}</p>}
                    </div>
                  </div>
                  <div className="text-sm"><span className="text-zinc-500">{cart.commercialMode === "full" ? "Сумма" : "Розничная стоимость"}</span><p className="mt-1 font-semibold">{cart.commercialMode === "full" ? line.partnerLineTotal ?? "Недоступна" : line.retailLineTotal ?? "Недоступна"}</p></div>
                  <CartItemActions itemId={line.id} quantity={line.quantity} />
                </li>
              ))}
            </ul>
              </section>;
            })}
          </div>
          <aside className="space-y-4 [&_button]:min-h-11 [&_input]:min-h-11">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-sm text-zinc-600">Позиций</p>
              <p className="mt-1 text-xl font-semibold">{cart.positionCount}</p>
              <p className="mt-3 text-sm text-zinc-600">Единиц товара</p>
              <p className="mt-1 text-lg font-semibold">{cart.totalUnitCount}</p>
              <p className="mt-4 text-sm text-zinc-600">{cart.commercialMode === "full" ? "Итого" : "Справочная розничная сумма"}</p>
              <p className="mt-1 text-xl font-semibold">{cart.commercialMode === "full" ? cart.total ?? "Требуется актуальная цена" : cart.retailReferenceTotal ?? "Цена уточняется"}</p>
              {cart.commercialMode === "retail_only" ? <p className="mt-3 text-xs leading-5 text-zinc-600">Заказ будет оформлен по коммерческим условиям вашей компании. Партнёрские цены скрыты в соответствии с настройками доступа.</p> : null}
            </div>
            <CreateEstimateFromCartButton />
            <SaveAsPurchasingListButton source="cart" />
            <SaveAsPurchaseTemplateButton source={{ type: "cart" }} />
            <OrderSubmitForm
              cartId={cart.id!}
              intentVersion={cart.intentVersion!}
              submissionKey={crypto.randomUUID()}
            />
          </aside>
        </div>
        </CartCheckoutCoordinator>
      )}
    </div>
  );
}

function PageMessage({ title, message }: { title: string; message: string }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-5"><h1 className="font-semibold text-rose-950">{title}</h1><p className="mt-2 text-sm text-rose-800">{message}</p></div>;
}
