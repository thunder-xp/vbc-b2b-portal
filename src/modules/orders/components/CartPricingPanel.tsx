"use client";

import { useEffect } from "react";
import { useCartCheckoutCoordinator } from "./CartCheckoutCoordinator";
import { OrderSubmitForm } from "./OrderSubmitForm";
import { CreateEstimateFromCartButton } from "../../estimates/components/CreateEstimateFromCartButton";
import { SaveAsPurchasingListButton } from "../../purchasing-lists/components";
import type { PartnerCheckoutOptionsDto } from "../services";
import type { getOrdersCopy } from "../../partner-locale";

type CartPricingPanelProps = {
  positionCount: number;
  totalUnitCount: number;
  total999: string | null;
  total113: string | null;
  savings: string | null;
  checkoutOptions?: PartnerCheckoutOptionsDto | null;
  commercialRateId?: string | null;
  onlinePaymentEnabled: boolean;
  reconciliationLocked: boolean;
  submissionKey: string;
  cartId: string;
  intentVersion: number;
  locale: "ru" | "ro";
  copy: ReturnType<typeof getOrdersCopy>;
};

export function CartPricingPanel(props: CartPricingPanelProps) {
  const { paymentMethod, setPaymentMethod } = useCartCheckoutCoordinator();
  const onlineSelected = paymentMethod === "online";
  const cashlessEnabled = props.checkoutOptions?.paymentMethods.some((option) => option.value === "cashless" && option.enabled) === true;
  const cashEnabled = props.checkoutOptions?.paymentMethods.some((option) => option.value === "cash" && option.enabled) === true;
  const labels = props.locale === "ro"
    ? { payNow: "PLĂTEȘTE ACUM", payLater: "Plătește mai târziu", save: "Plătiți acum și economisiți la curs: ", unavailable: "Ratele comerciale necesare nu sunt disponibile.", selected: "Selectat" }
    : { payNow: "ОПЛАТИТЬ СЕЙЧАС", payLater: "Оплатить позже", save: "Оплатите сейчас и сэкономьте на курсовой разнице: ", unavailable: "Не удалось подтвердить необходимые курсы.", selected: "Выбрано" };

  useEffect(() => {
    if (!paymentMethod) return;
    const checkoutForm = document.getElementById("cart-checkout-form");
    if (typeof checkoutForm?.scrollIntoView === "function") {
      checkoutForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [paymentMethod]);

  return (
    <>
      <section aria-label={props.copy.total} className="rounded-lg border border-zinc-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-600">{props.copy.itemCount}</dt><dd className="text-right font-semibold">{props.positionCount}</dd>
          <dt className="text-zinc-600">{props.copy.unitCount}</dt><dd className="text-right font-semibold">{props.totalUnitCount}</dd>
        </dl>
        <p className="mt-3 border-t border-zinc-200 pt-3 text-sm text-zinc-600">{props.copy.total}</p>
        <p aria-live="polite" className="mt-1 text-xl font-semibold text-rose-700">{onlineSelected ? (props.total113 ?? props.copy.pricePending) : (props.total999 ?? props.copy.pricePending)}</p>
        {!onlineSelected && props.savings ? <p className="mt-3 rounded-md bg-emerald-50 p-2 text-sm font-medium text-emerald-800">{labels.save}<strong className="text-rose-700">{props.savings}</strong></p> : null}
        {!props.onlinePaymentEnabled ? <p className="mt-3 text-xs text-amber-800">{labels.unavailable}</p> : null}
      </section>

      <section aria-label={labels.payNow} className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
        <button className="min-h-12 w-full rounded-md bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={!props.onlinePaymentEnabled || props.reconciliationLocked} onClick={() => setPaymentMethod("online")} type="button">
          {onlineSelected ? labels.selected : labels.payNow}
        </button>
      </section>

      {!onlineSelected ? (
        <section aria-label={labels.payLater} className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">{labels.payLater}</h2>
          <div className="grid grid-cols-2 gap-2">
            <button aria-pressed={paymentMethod === "cashless"} className={`min-h-11 rounded-md border px-2 text-sm font-medium ${paymentMethod === "cashless" ? "border-emerald-700 bg-emerald-50" : "border-zinc-300 bg-white"}`} disabled={!cashlessEnabled || props.reconciliationLocked} onClick={() => setPaymentMethod("cashless")} type="button">{props.copy.cashless}</button>
            <button aria-pressed={paymentMethod === "cash"} className={`min-h-11 rounded-md border px-2 text-sm font-medium ${paymentMethod === "cash" ? "border-emerald-700 bg-emerald-50" : "border-zinc-300 bg-white"}`} disabled={!cashEnabled || props.reconciliationLocked} onClick={() => setPaymentMethod("cash")} type="button">{props.copy.cash}</button>
          </div>
        </section>
      ) : null}

      {paymentMethod ? <div id="cart-checkout-form"><OrderSubmitForm cartId={props.cartId} intentVersion={props.intentVersion} submissionKey={props.submissionKey} checkoutOptions={props.checkoutOptions} commercialRateId={props.commercialRateId} onlinePaymentEnabled={props.onlinePaymentEnabled} reconciliationLocked={props.reconciliationLocked} /></div> : null}

      {!onlineSelected ? (
        <section aria-label={props.copy.additionalCartActions} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 [&_button]:min-h-11 [&_button]:w-full [&_button]:justify-center">
          <CreateEstimateFromCartButton />
          <SaveAsPurchasingListButton label={props.locale === "ro" ? "Salvează setul" : "Сохранить комплект"} source="cart" />
        </section>
      ) : null}
    </>
  );
}

export function CartLineValue({
  standard,
  online,
}: {
  standard: string | null | undefined;
  online: string | null | undefined;
}) {
  const { paymentMethod } = useCartCheckoutCoordinator();
  return <>{paymentMethod === "online" ? (online ?? "—") : (standard ?? "—")}</>;
}
