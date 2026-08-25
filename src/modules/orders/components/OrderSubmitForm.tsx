"use client";

import {
  type FormEvent,
  useActionState,
  useEffect,
  useRef,
  startTransition,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "../../access-control/actions/action-result";
import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import {
  submitCartOrderAction,
  type PartnerOrderSubmissionReceipt,
} from "../actions/order.actions";
import { useCartCheckoutCoordinator } from "./CartCheckoutCoordinator";
import { getOrdersCopy, usePartnerLocale } from "../../partner-locale";
import type { PartnerCheckoutOptionsDto } from "../services";

const initial: ActionResult<PartnerOrderSubmissionReceipt | null> = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};

type CheckoutPhase =
  | "idle"
  | "cart_update_pending"
  | "failed_retryable";

export function OrderSubmitForm({
  cartId,
  intentVersion,
  submissionKey,
  checkoutOptions,
  reconciliationLocked = false,
}: {
  cartId?: string;
  intentVersion?: number;
  submissionKey: string;
  checkoutOptions?: PartnerCheckoutOptionsDto | null;
  reconciliationLocked?: boolean;
}) {
  const [state, action, actionPending] = useActionState(
    submitCartOrderAction,
    initial,
  );
  const locale = usePartnerLocale();
  const copy = getOrdersCopy(locale);
  const options = checkoutOptions ?? defaultCheckoutOptions();
  const initialPaymentMethod = options.paymentMethods.find((option) => option.enabled)?.value ?? "";
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cashless" | "cash" | "">(initialPaymentMethod);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"pickup" | "delivery">("pickup");
  const [carrierId, setCarrierId] = useState("");
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const [barrierError, setBarrierError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const submissionKeyRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { flushPendingMutations, hasPendingMutations } =
    useCartCheckoutCoordinator();

  useEffect(() => {
    if (state.success && state.data?.id) {
      recordBehaviorInteraction({
        eventName: "order_submitted",
        route: "/cabinet/cart",
        sourceSurface: "checkout",
      });
      router.push(`/cabinet/orders/${state.data.id}?submitted=1`);
    }
  }, [router, state]);

  useEffect(() => {
    if (!state.success && state.errorCode === "ORDER_CART_VERSION_CONFLICT") {
      router.refresh();
    }
    if (
      !state.success &&
      isDefinitiveRecoverableFailure(state.errorCode) &&
      submissionKeyRef.current
    ) {
      submissionKeyRef.current.value = crypto.randomUUID();
    }
  }, [router, state]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (actionPending)
      return;

    setBarrierError("");
    setPhase("cart_update_pending");
    void (async () => {
      const barrierStartedAt = performance.now();
      try {
        await flushPendingMutations();
        console.info({
          event: "checkout_mutation_barrier_completed",
          durationMs: Math.round(performance.now() - barrierStartedAt),
        });
        const form = formRef.current;
        if (!form || !form.reportValidity()) {
          setPhase("idle");
          return;
        }
        setPhase("idle");
        startTransition(() => {
          action(new FormData(form));
        });
      } catch {
        setPhase("failed_retryable");
        setBarrierError(copy.cartBarrierError);
      }
    })();
  };

  const retryBlocked =
    reconciliationLocked ||
    (!state.success &&
      ["ORDER_IN_PROGRESS", "ORDER_RECONCILIATION_REQUIRED"].includes(
        state.errorCode,
      ));
  const busy =
    actionPending ||
    hasPendingMutations ||
    phase === "cart_update_pending";
  const selectedPaymentOption = options.paymentMethods.find(
    (option) => option.value === paymentMethod,
  );
  const checkoutUnavailable = !selectedPaymentOption?.enabled;
  const deliveryUnavailable = options.carriers.length === 0;
  const checkoutReady = Boolean(
    selectedPaymentOption?.enabled
    && isSelectableDate(paymentDate)
    && isSelectableDate(deliveryDate)
    && (fulfillmentMethod === "pickup" || carrierId),
  );

  return (
    <form
      action={action}
      aria-label={copy.checkoutReview}
      className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <input name="cartId" type="hidden" value={cartId ?? ""} />
      <input
        name="expectedIntentVersion"
        type="hidden"
        value={intentVersion || ""}
      />
      <input
        defaultValue={submissionKey}
        name="submissionKey"
        ref={submissionKeyRef}
        type="hidden"
      />
      <h2 className="font-semibold text-zinc-950">{copy.checkoutReview}</h2>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-800">{copy.paymentMethod}</legend>
        <div className="grid grid-cols-2 gap-2">
          {options.paymentMethods.map((option) => (
            <label
              className={`flex min-h-11 items-center justify-center rounded-md border px-2 text-center text-sm font-medium ${
                option.enabled
                  ? "cursor-pointer border-zinc-300 has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50"
                  : "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400"
              }`}
              key={option.value}
              title={!option.enabled ? unavailableReason(option.value, copy) : undefined}
            >
              <input
                checked={paymentMethod === option.value}
                className="sr-only"
                disabled={!option.enabled}
                name="paymentMethod"
                onChange={() => setPaymentMethod(option.value)}
                type="radio"
                value={option.value}
              />
              {option.value === "cashless" ? copy.cashless : copy.cash}
            </label>
          ))}
        </div>
        {options.paymentMethods.filter((option) => !option.enabled).map((option) => (
          <p className="text-xs text-zinc-600" key={`${option.value}-reason`}>
            {unavailableReason(option.value, copy)}
          </p>
        ))}
        {selectedPaymentOption?.contractLabel ? (
          <p className="text-xs text-zinc-600">
            {copy.contract}: {selectedPaymentOption.contractLabel}
          </p>
        ) : null}
      </fieldset>
      <label className="block text-sm font-medium text-zinc-800">
        {copy.paymentDate}
        <input
          className="mt-1 block h-10 w-full rounded-md border border-zinc-300 px-3"
          min={chisinauBusinessDate()}
          name="paymentDate"
          onChange={(event) => setPaymentDate(event.target.value)}
          required
          type="date"
          value={paymentDate}
        />
        {!paymentDate ? (
          <span className="mt-1 block text-xs text-zinc-600">{copy.paymentDateRequired}</span>
        ) : null}
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-800">{copy.fulfillmentMethod}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["pickup", "delivery"] as const).map((method) => (
            <label
              className={`flex min-h-11 items-center justify-center rounded-md border px-2 text-center text-sm font-medium ${
                method === "delivery" && deliveryUnavailable
                  ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400"
                  : "cursor-pointer border-zinc-300 has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50"
              }`}
              key={method}
            >
              <input
                checked={fulfillmentMethod === method}
                className="sr-only"
                disabled={method === "delivery" && deliveryUnavailable}
                name="fulfillmentMethod"
                onChange={() => {
                  setFulfillmentMethod(method);
                  if (method === "pickup") setCarrierId("");
                }}
                type="radio"
                value={method}
              />
              {method === "pickup" ? copy.pickup : copy.delivery}
            </label>
          ))}
        </div>
        {deliveryUnavailable ? (
          <p className="text-xs text-zinc-600">{copy.deliveryUnavailable}</p>
        ) : null}
      </fieldset>
      {fulfillmentMethod === "delivery" ? (
        <label className="block text-sm font-medium text-zinc-800">
          {copy.carrier}
          <select
            className="mt-1 block h-10 w-full rounded-md border border-zinc-300 bg-white px-3"
            name="carrierId"
            onChange={(event) => setCarrierId(event.target.value)}
            required
            value={carrierId}
          >
            <option value="">{copy.selectCarrier}</option>
            {options.carriers.map((carrier) => (
              <option key={carrier.id} value={carrier.id}>{carrier.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <input name="carrierId" type="hidden" value="" />
      )}
      <label className="block text-sm font-medium text-zinc-800">
        {copy.requestedDeliveryDate}
        <input
          className="mt-1 block h-10 w-full rounded-md border border-zinc-300 px-3"
          min={chisinauBusinessDate()}
          name="requestedDeliveryDate"
          onChange={(event) => setDeliveryDate(event.target.value)}
          required
          type="date"
          value={deliveryDate}
        />
      </label>
      {deliveryDate ? (
        <p className="text-xs font-medium text-zinc-700">
          {copy.selected}: {formatBusinessDate(deliveryDate, locale)}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-zinc-600">{copy.shipmentDateHint}</p>
      <button
        className="h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy || retryBlocked || checkoutUnavailable || !checkoutReady}
        type="submit"
      >
        {submitLabel(phase, actionPending, hasPendingMutations, copy)}
      </button>
      {checkoutUnavailable ? (
        <p aria-live="polite" className="text-sm text-amber-800">
          {copy.checkoutUnavailable}
        </p>
      ) : null}
      {hasPendingMutations ? (
        <p aria-live="polite" className="text-sm text-amber-800">
          {copy.savingCart}
        </p>
      ) : null}
      {barrierError ? (
        <p aria-live="assertive" className="text-sm text-rose-700">
          {barrierError}
        </p>
      ) : null}
      {state.message ? (
        <p
          aria-live="polite"
          className={`text-sm ${
            state.success ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {state.success ? state.message : orderFailureMessage(state.errorCode, copy)}
        </p>
      ) : null}
    </form>
  );
}

function defaultCheckoutOptions(): PartnerCheckoutOptionsDto {
  return {
    counterpartyKind: "unknown",
    paymentMethods: [
      { value: "cashless", enabled: false, contractLabel: null, unavailableReason: "contract_unavailable" },
      { value: "cash", enabled: false, contractLabel: null, unavailableReason: "contract_unavailable" },
    ],
    carriers: [],
  };
}

function unavailableReason(
  method: "cashless" | "cash",
  copy: ReturnType<typeof getOrdersCopy>,
): string {
  return method === "cashless" ? copy.cashlessUnavailable : copy.cashUnavailable;
}

export function chisinauBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Chisinau",
    year: "numeric",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function isSelectableDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= chisinauBusinessDate();
}

export function formatBusinessDate(
  value: string,
  locale: "ru" | "ro" = "ru",
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatRussianBusinessDate(value: string): string {
  return formatBusinessDate(value, "ru");
}

function submitLabel(
  phase: CheckoutPhase,
  actionPending: boolean,
  hasPendingMutations: boolean,
  copy: ReturnType<typeof getOrdersCopy>,
): string {
  if (actionPending) return copy.sendingOrder;
  if (phase === "cart_update_pending" || hasPendingMutations) {
    return copy.savingCartShort;
  }
  return copy.sendOrder;
}

function isDefinitiveRecoverableFailure(code: string | null): boolean {
  return (
    code !== null &&
    ![
      "ORDER_IN_PROGRESS",
      "ORDER_RECONCILIATION_REQUIRED",
      "ORDER_1C_TIMEOUT",
      "ORDER_1C_ALREADY_CREATED",
      "ORDER_READBACK_FAILED",
    ].includes(code)
  );
}

function orderFailureMessage(
  code: string | null,
  copy: ReturnType<typeof getOrdersCopy>,
): string {
  switch (code) {
    case "ORDER_IN_PROGRESS":
      return copy.orderInProgress;
    case "ORDER_RECONCILIATION_REQUIRED":
    case "ORDER_1C_TIMEOUT":
    case "ORDER_1C_ALREADY_CREATED":
    case "ORDER_READBACK_FAILED":
      return copy.orderReconciliationRequired;
    case "ORDER_COMPANY_MAPPING_MISSING":
      return copy.orderCompanyMappingMissing;
    case "ORDER_CONTRACT_MAPPING_MISSING":
      return copy.orderContractMappingMissing;
    case "ORDER_PRODUCT_MAPPING_MISSING":
      return copy.orderProductMappingMissing;
    case "ORDER_PRICE_REFRESH_FAILED":
    case "ORDER_PRICE_REFRESH_REQUIRED":
    case "ORDER_PRICE_STALE":
      return copy.orderPriceRefreshFailed;
    case "ORDER_PRICE_CHANGED":
      return copy.orderPriceChangedError;
    case "ORDER_PRICE_DATA_MISSING":
      return copy.orderPriceDataMissing;
    case "ORDER_STOCK_CHANGED":
      return copy.orderStockChanged;
    case "ORDER_INVALID_SHIPMENT_DATE":
      return copy.orderInvalidShipmentDate;
    case "ORDER_INVALID_PAYMENT_DATE":
      return copy.orderInvalidPaymentDate;
    case "ORDER_PAYMENT_METHOD_UNAVAILABLE":
      return copy.orderPaymentMethodUnavailable;
    case "ORDER_FULFILLMENT_INVALID":
      return copy.orderFulfillmentInvalid;
    case "ORDER_CARRIER_REQUIRED":
      return copy.orderCarrierRequired;
    case "ORDER_CART_VERSION_CONFLICT":
      return copy.orderCartVersionConflict;
    case "ORDER_1C_VALIDATION_FAILED":
      return copy.orderOneCValidationFailed;
    case "ORDER_SUBMISSION_INFRASTRUCTURE_FAILURE":
    case "ORDER_UNKNOWN_FAILURE":
      return copy.orderInfrastructureFailure;
    default:
      return copy.retryOrContact;
  }
}
