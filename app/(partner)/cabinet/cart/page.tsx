import Link from "next/link";

import { ProductLineThumbnail } from "@/src/modules/catalog/components/ProductLineThumbnail";
import { getCartAction } from "@/src/modules/orders/actions";
import { CartItemActions } from "@/src/modules/orders/components/CartItemActions";
import { CartCheckoutCoordinator } from "@/src/modules/orders/components/CartCheckoutCoordinator";
import { CartCommercialRecheck } from "@/src/modules/orders/components/CartCommercialRecheck";
import { OrderSubmitForm } from "@/src/modules/orders/components/OrderSubmitForm";
import { CreateEstimateFromCartButton } from "@/src/modules/estimates/components/CreateEstimateFromCartButton";
import { SaveAsPurchasingListButton } from "@/src/modules/purchasing-lists/components";
import { SaveAsPurchaseTemplateButton } from "@/src/modules/purchase-templates/components";
import type { CartLineDto } from "@/src/modules/orders/services";
import { getOrdersCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function CartPage() {
  const [result, locale] = await Promise.all([
    getCartAction(),
    getPartnerLocale(),
  ]);
  const copy = getOrdersCopy(locale);
  const groups: Array<{
    key: CartLineDto["availabilityGroup"];
    title: string;
    description: string;
  }> = [
    {
      key: "available",
      title: copy.availableNow,
      description: copy.availableNowHint,
    },
    {
      key: "expected",
      title: copy.expectedArrival,
      description: copy.expectedArrivalHint,
    },
    {
      key: "confirmation",
      title: copy.confirmationRequired,
      description: copy.confirmationRequiredHint,
    },
  ];

  if (!result.success) {
    return (
      <PageMessage title={copy.cartUnavailable} message={copy.retryOrContact} />
    );
  }

  const cart = result.data;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase text-emerald-700">
          {copy.checkoutEyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">
          {copy.cart}
        </h1>
      </header>

      {cart.lines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">{copy.cartEmpty}</h2>
          <p className="mt-2 text-sm text-zinc-600">{copy.cartEmptyHint}</p>
          <Link
            className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            href="/cabinet/catalog"
            prefetch={false}
          >
            {copy.openCatalog}
          </Link>
        </div>
      ) : (
        <CartCheckoutCoordinator>
          {cart.reconciliationLock ? (
            <div
              aria-live="polite"
              className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="status"
            >
              {cart.reconciliationLock.stale
                ? copy.cartReconciliationStale
                : copy.cartReconciliationLocked}
              {cart.reconciliationLock.stale && cart.reconciliationLock.correlationId ? (
                <span className="mt-1 block font-mono text-xs">
                  {copy.correlationCode}: {cart.reconciliationLock.correlationId}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              {groups.map((group) => {
                const lines = cart.lines.filter(
                  (line) => line.availabilityGroup === group.key,
                );
                if (!lines.length) return null;
                return (
                  <section
                    className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
                    key={group.key}
                  >
                    <header className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                      <h2 className="text-sm font-semibold text-zinc-950">
                        {group.title} · {lines.length}
                      </h2>
                      <p className="mt-0.5 text-xs text-zinc-600">
                        {group.description}
                      </p>
                    </header>
                    <ul className="divide-y divide-zinc-200">
                      {lines.map((line) => (
                        <li
                          className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_8rem_11.25rem] md:items-center"
                          key={line.id}
                        >
                          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4rem_minmax(0,1fr)]">
                            <ProductLineThumbnail
                              imageUrl={line.imageUrl}
                              productName={line.productName}
                            />
                            <div className="min-w-0">
                              <Link
                                className="line-clamp-2 font-semibold text-zinc-950 hover:text-emerald-700"
                                href={`/cabinet/catalog/${line.slug}`}
                                prefetch={false}
                              >
                                {line.productName}
                              </Link>
                              <p className="mt-1 text-xs text-zinc-500">
                                {copy.sku}: {line.sku}
                              </p>
                              <p className="mt-2 text-sm">
                                {cart.commercialMode === "full"
                                  ? copy.yourPrice
                                  : copy.retailPrice}
                                :{" "}
                                <strong className="whitespace-nowrap">
                                  {cart.commercialMode === "full"
                                    ? (line.partnerUnitPrice ??
                                      copy.pricePending)
                                    : (line.retailUnitPrice ??
                                      copy.pricePending)}
                                </strong>
                              </p>
                              <p className="mt-1 text-xs text-zinc-600">
                                {line.availableStock === null
                                  ? copy.stockPending
                                  : line.availableStock > 0
                                    ? `${copy.inStock}: ${line.availableStock} ${copy.units}`
                                    : copy.outOfStock}
                              </p>
                              {line.nearestArrivalDate && (
                                <p className="mt-1 text-xs text-zinc-600">
                                  {copy.arrival}: {line.nearestArrivalDate}
                                  {line.nearestArrivalQuantity !== null
                                    ? `, ${line.nearestArrivalQuantity} ${copy.units}`
                                    : ""}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-sm">
                            <span className="text-zinc-500">
                              {cart.commercialMode === "full"
                                ? copy.amount
                                : copy.retailAmount}
                            </span>
                            <p className="mt-1 font-semibold">
                              {cart.commercialMode === "full"
                                ? (line.partnerLineTotal ?? copy.unavailable)
                                : (line.retailLineTotal ?? copy.unavailable)}
                            </p>
                          </div>
                          <CartItemActions
                            itemId={line.id}
                            locked={cart.reconciliationLock !== null}
                            quantity={line.quantity}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
            <aside className="space-y-4 [&_button]:min-h-11 [&_input]:min-h-11">
              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-zinc-600">{copy.itemCount}</dt>
                  <dd className="text-right font-semibold">{cart.positionCount}</dd>
                  <dt className="text-zinc-600">{copy.unitCount}</dt>
                  <dd className="text-right font-semibold">{cart.totalUnitCount}</dd>
                </dl>
                <p className="mt-3 border-t border-zinc-200 pt-3 text-sm text-zinc-600">
                  {cart.commercialMode === "full"
                    ? copy.total
                    : copy.retailReferenceTotal}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {cart.commercialMode === "full"
                    ? (cart.total ?? copy.pricePending)
                    : (cart.retailReferenceTotal ?? copy.pricePending)}
                </p>
                {cart.commercialMode === "retail_only" ? (
                  <p className="mt-3 text-xs leading-5 text-zinc-600">
                    {copy.retailOnlyNote}
                  </p>
                ) : null}
              </div>
              <CartCommercialRecheck />
              <CreateEstimateFromCartButton />
              <div
                aria-label={copy.additionalCartActions}
                className="grid gap-2 [&>button]:h-11 [&>button]:w-full [&>button]:justify-center"
              >
                <SaveAsPurchasingListButton label={copy.saveToFavorites} source="cart" />
                <SaveAsPurchaseTemplateButton label={copy.saveToTemplate} source={{ type: "cart" }} />
              </div>
              <OrderSubmitForm
                cartId={cart.id!}
                intentVersion={cart.intentVersion!}
                submissionKey={crypto.randomUUID()}
                checkoutOptions={cart.checkoutOptions}
                reconciliationLocked={cart.reconciliationLock !== null}
              />
            </aside>
          </div>
        </CartCheckoutCoordinator>
      )}
    </div>
  );
}

function PageMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
      <h1 className="font-semibold text-rose-950">{title}</h1>
      <p className="mt-2 text-sm text-rose-800">{message}</p>
    </div>
  );
}
