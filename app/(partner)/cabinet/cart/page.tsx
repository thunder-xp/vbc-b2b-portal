import Link from "next/link";

import { ProductLineThumbnail } from "@/src/modules/catalog/components/ProductLineThumbnail";
import { getCartAction } from "@/src/modules/orders/actions";
import { CartItemActions } from "@/src/modules/orders/components/CartItemActions";
import { CartCheckoutCoordinator } from "@/src/modules/orders/components/CartCheckoutCoordinator";
import { CartLineValue, CartPricingPanel } from "@/src/modules/orders/components/CartPricingPanel";
import { maibConfigurationSummary } from "@/src/modules/payments/server";
import { OrderReconciliationStatus } from "@/src/modules/orders/components/OrderReconciliationStatus";
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
        <CartCheckoutCoordinator managedPaymentSelection>
          <OrderReconciliationStatus
            initialState={cart.reconciliationLock ? {
              orderId: cart.reconciliationLock.orderId,
              state: cart.reconciliationLock.attemptCount > 0
                ? "unknown_retrying"
                : "checking",
              external1cNumber: null,
            } : null}
            stale={cart.reconciliationLock?.stale}
            surface="cart"
          />
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
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_7rem_auto] md:items-center md:gap-3 md:p-4"
                          key={line.id}
                        >
                          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4rem_minmax(0,1fr)]">
                            <ProductLineThumbnail
                              imageUrl={line.imageUrl}
                              productName={line.productName}
                            />
                            <div className="min-w-0">
                              {line.catalogVisible === false
                                ? <p className="line-clamp-2 font-semibold text-zinc-950">{line.productName}</p>
                                : <Link
                                    className="line-clamp-2 font-semibold text-zinc-950 hover:text-emerald-700"
                                    href={`/cabinet/catalog/${line.slug}`}
                                    prefetch={false}
                                  >
                                    {line.productName}
                                  </Link>}
                              <p className="mt-1 text-xs text-zinc-500">
                                {copy.sku}: {line.sku}
                              </p>
                              <p className="mt-2 text-sm">
                                {cart.commercialMode === "full"
                                  ? copy.yourPrice
                                  : copy.retailPrice}
                                :{" "}
                                <strong className="whitespace-nowrap text-zinc-800"><CartLineValue standard={cart.commercialMode === "full" ? line.partnerUnitPrice : line.retailUnitPrice} online={line.onlineUnitPrice} /></strong>
                              </p>
                              <p className="mt-1 text-xs text-zinc-600">
                                {line.availableStock === null
                                  ? copy.stockPending
                                  : line.availableStock <= 0
                                    ? copy.outOfStock
                                    : line.availableStock < line.quantity
                                      ? `${copy.availableOfRequested.replace("{available}", String(line.availableStock)).replace("{requested}", String(line.quantity))}`
                                      : copy.inStock}
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
                            <p className="mt-1 font-semibold text-zinc-800"><CartLineValue standard={cart.commercialMode === "full" ? line.partnerLineTotal : line.retailLineTotal} online={line.onlineLineTotal} /></p>
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
              <CartPricingPanel
                positionCount={cart.positionCount}
                totalUnitCount={cart.totalUnitCount}
                total999={cart.total ?? null}
                total113={cart.onlineTotal ?? null}
                savings={cart.onlineSavings ?? null}
                locale={locale}
                copy={copy}
                cartId={cart.id!}
                intentVersion={cart.intentVersion!}
                submissionKey={crypto.randomUUID()}
                checkoutOptions={cart.checkoutOptions}
                commercialRateId={cart.commercialRateId}
                onlinePaymentEnabled={maibConfigurationSummary().ready
                  && cart.onlinePaymentPreflightEligible === true}
                reconciliationLocked={cart.reconciliationLock !== null}
              />
              {cart.commercialMode === "retail_only" ? <p className="text-xs leading-5 text-zinc-600">{copy.retailOnlyNote}</p> : null}
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
