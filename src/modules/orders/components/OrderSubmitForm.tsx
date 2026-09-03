"use client";

import {
  type FormEvent,
  type ReactNode,
  useRef,
  useState,
  useTransition,
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
  const [state, setState] = useState(initial);
  const [actionPending, startActionTransition] = useTransition();
  const locale = usePartnerLocale();
  const copy = getOrdersCopy(locale);
  const options = checkoutOptions ?? defaultCheckoutOptions();
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cashless" | "cash" | "">("");
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"pickup" | "delivery" | "">("");
  const [carrierId, setCarrierId] = useState("");
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const [barrierError, setBarrierError] = useState("");
  const [currentSubmissionKey, setCurrentSubmissionKey] = useState(submissionKey);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { flushPendingMutations, hasPendingMutations } =
    useCartCheckoutCoordinator();

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
        startActionTransition(async () => {
          const result = await submitCartOrderAction(initial, new FormData(form));
          if (result.success && result.data?.redirectTo) {
            recordBehaviorInteraction({
              eventName: "order_submitted",
              route: "/cabinet/cart",
              sourceSurface: "checkout",
            });
            router.replace(result.data.redirectTo);
            return;
          }

          setState(result);
          if (result.errorCode === "ORDER_CART_VERSION_CONFLICT") {
            router.refresh();
          }
          if (
            isDefinitiveRecoverableFailure(result.errorCode)
          ) {
            setCurrentSubmissionKey(crypto.randomUUID());
          }
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
  const paymentMethodsUnavailable = !options.paymentMethods.some(
    (option) => option.enabled,
  );
  const deliveryUnavailable = options.carriers.length === 0;
  const paymentComplete = selectedPaymentOption?.enabled === true;
  const paymentDateComplete = paymentComplete && isSelectableDate(paymentDate);
  const fulfillmentComplete = paymentDateComplete && Boolean(
    fulfillmentMethod === "pickup"
    || (fulfillmentMethod === "delivery" && carrierId),
  );
  const reservationComplete = fulfillmentComplete && isSelectableDate(deliveryDate);
  const checkoutReady = Boolean(
    selectedPaymentOption?.enabled
    && isSelectableDate(paymentDate)
    && isSelectableDate(deliveryDate)
    && (fulfillmentMethod === "pickup" || carrierId),
  );
  const failureMessage = !state.success
    ? orderFailureMessage(state.errorCode, copy, state.message)
    : "";
  const failedStep = checkoutFailureStep(state.errorCode);
  const paymentDateInvalid = paymentDate !== "" && !isSelectableDate(paymentDate);
  const deliveryDateInvalid = deliveryDate !== "" && !isSelectableDate(deliveryDate);

  return (
    <form
      aria-label={copy.checkoutReview}
      className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3"
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
        name="submissionKey"
        type="hidden"
        value={currentSubmissionKey}
      />
      <CheckoutStep
        copy={copy}
        label={copy.paymentMethod}
        number={1}
        state={failedStep === 1 || paymentMethodsUnavailable
          ? "error"
          : paymentComplete ? "complete" : "active"}
      >
        <fieldset>
          <legend className="sr-only">{copy.paymentMethod}</legend>
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
              {!option.enabled ? (
                <span className="sr-only">. {unavailableReason(option.value, copy)}</span>
              ) : null}
            </label>
          ))}
        </div>
        </fieldset>
        {paymentMethodsUnavailable ? (
          <p aria-live="polite" className="mt-2 text-sm text-amber-800">
            {copy.checkoutUnavailable}
          </p>
        ) : null}
        {failedStep === 1 && failureMessage ? (
          <StepError message={failureMessage} />
        ) : null}
      </CheckoutStep>
      <CheckoutStep
        copy={copy}
        label={copy.paymentDate}
        number={2}
        state={failedStep === 2 || paymentDateInvalid
          ? "error"
          : paymentDateComplete
            ? "complete"
            : paymentComplete ? "active" : "inactive"}
      >
        <label className="sr-only" htmlFor="checkout-payment-date">{copy.paymentDate}</label>
        <input
          aria-invalid={paymentDateInvalid || undefined}
          className="block h-10 w-full rounded-md border border-zinc-300 bg-white px-3 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
          disabled={!paymentComplete}
          id="checkout-payment-date"
          min={chisinauBusinessDate()}
          name="paymentDate"
          onChange={(event) => setPaymentDate(event.target.value)}
          required
          type="date"
          value={paymentDate}
        />
        {paymentDateInvalid ? (
          <StepError message={copy.orderInvalidPaymentDate} />
        ) : failedStep === 2 && failureMessage ? (
          <StepError message={failureMessage} />
        ) : null}
      </CheckoutStep>
      <CheckoutStep
        copy={copy}
        label={copy.fulfillmentMethod}
        number={3}
        state={failedStep === 3
          ? "error"
          : fulfillmentComplete
            ? "complete"
            : paymentDateComplete ? "active" : "inactive"}
      >
        <fieldset>
          <legend className="sr-only">{copy.fulfillmentMethod}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["pickup", "delivery"] as const).map((method) => {
            const disabled = !paymentDateComplete
              || (method === "delivery" && deliveryUnavailable);
            return (
              <label
                className={`flex min-h-11 items-center justify-center rounded-md border px-2 text-center text-sm font-medium ${
                  disabled
                    ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400"
                    : "cursor-pointer border-zinc-300 has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50"
                }`}
                key={method}
              >
                <input
                  checked={fulfillmentMethod === method}
                  className="sr-only"
                  disabled={disabled}
                  name="fulfillmentMethod"
                  onChange={() => {
                    setFulfillmentMethod(method);
                    if (method === "pickup") setCarrierId("");
                  }}
                  type="radio"
                  value={method}
                />
                {method === "pickup" ? copy.pickup : copy.delivery}
                {method === "delivery" && deliveryUnavailable ? (
                  <span className="sr-only">. {copy.deliveryUnavailable}</span>
                ) : null}
              </label>
            );
          })}
        </div>
        </fieldset>
        {fulfillmentMethod === "delivery" ? (
          <label className="mt-2 block text-sm font-medium text-zinc-700">
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
        {failedStep === 3 && failureMessage ? (
          <StepError message={failureMessage} />
        ) : null}
      </CheckoutStep>
      <CheckoutStep
        copy={copy}
        label={copy.requestedDeliveryDate}
        number={4}
        state={failedStep === 4 || deliveryDateInvalid
          ? "error"
          : reservationComplete
            ? "complete"
            : fulfillmentComplete ? "active" : "inactive"}
      >
        <label className="sr-only" htmlFor="checkout-reservation-date">{copy.requestedDeliveryDate}</label>
        <input
          aria-invalid={deliveryDateInvalid || undefined}
          className="block h-10 w-full rounded-md border border-zinc-300 bg-white px-3 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
          disabled={!fulfillmentComplete}
          id="checkout-reservation-date"
          min={chisinauBusinessDate()}
          name="requestedDeliveryDate"
          onChange={(event) => setDeliveryDate(event.target.value)}
          required
          type="date"
          value={deliveryDate}
        />
        {deliveryDateInvalid ? (
          <StepError message={copy.orderInvalidShipmentDate} />
        ) : failedStep === 4 && failureMessage ? (
          <StepError message={failureMessage} />
        ) : null}
      </CheckoutStep>
      <button
        className="mt-3 h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy || retryBlocked || checkoutUnavailable || !checkoutReady}
        type="submit"
      >
        {submitLabel(phase, actionPending, hasPendingMutations, copy)}
      </button>
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
      {(state.success && state.message) || (!state.success && failedStep === null) ? (
        <p
          aria-live="polite"
          className={`text-sm ${
            state.success ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {state.success ? state.message : failureMessage}
        </p>
      ) : null}
    </form>
  );
}

type CheckoutStepState = "inactive" | "active" | "complete" | "error";

function CheckoutStep({
  children,
  copy,
  label,
  number,
  state,
}: {
  children: ReactNode;
  copy: ReturnType<typeof getOrdersCopy>;
  label: string;
  number: 1 | 2 | 3 | 4;
  state: CheckoutStepState;
}) {
  const stateLabel = {
    inactive: copy.checkoutStepInactive,
    active: copy.checkoutStepActive,
    complete: copy.checkoutStepComplete,
    error: copy.checkoutStepError,
  }[state];
  const shellClass = {
    inactive: "border-zinc-200 bg-zinc-50/70 text-zinc-500",
    active: "border-emerald-300 bg-white text-zinc-950 shadow-sm",
    complete: "border-zinc-200 bg-white text-zinc-950",
    error: "border-rose-300 bg-rose-50/40 text-zinc-950",
  }[state];
  const numberClass = {
    inactive: "border-zinc-300 bg-zinc-100 text-zinc-500",
    active: "border-emerald-700 bg-emerald-700 text-white",
    complete: "border-emerald-600 bg-emerald-50 text-emerald-800",
    error: "border-rose-600 bg-rose-50 text-rose-800",
  }[state];

  return (
    <section
      aria-current={state === "active" ? "step" : undefined}
      aria-label={`${copy.checkoutStep} ${number}: ${label}, ${stateLabel}`}
      className={`rounded-md border p-3 transition-colors ${shellClass}`}
      data-checkout-step={number}
      data-state={state}
    >
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${numberClass}`}
        >
          {number}
        </span>
        <h2 className="min-w-0 text-sm font-semibold leading-5">
          {label}
          <span className="sr-only"> — {stateLabel}</span>
        </h2>
        {state === "complete" ? (
          <span aria-hidden="true" className="ml-auto text-sm font-bold text-emerald-700">✓</span>
        ) : state === "error" ? (
          <span aria-hidden="true" className="ml-auto text-sm font-bold text-rose-700">!</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StepError({ message }: { message: string }) {
  return (
    <p aria-live="polite" className="mt-2 text-sm text-rose-700">
      {message}
    </p>
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

function checkoutFailureStep(code: string | null): 1 | 2 | 3 | 4 | null {
  switch (code) {
    case "ORDER_CONTRACT_MAPPING_MISSING":
    case "ORDER_PAYMENT_METHOD_UNAVAILABLE":
    case "ORDER_COUNTERPARTY_TYPE_UNSUPPORTED":
    case "ORDER_CONTRACT_INVALID":
      return 1;
    case "ORDER_INVALID_PAYMENT_DATE":
    case "ORDER_PAYMENT_CONFIGURATION_INVALID":
      return 2;
    case "ORDER_FULFILLMENT_INVALID":
    case "ORDER_CARRIER_REQUIRED":
    case "ORDER_FULFILLMENT_CONFIGURATION_INVALID":
      return 3;
    case "ORDER_INVALID_SHIPMENT_DATE":
      return 4;
    default:
      return null;
  }
}

function orderFailureMessage(
  code: string | null,
  copy: ReturnType<typeof getOrdersCopy>,
  serverMessage = "",
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
    case "ORDER_COUNTERPARTY_TYPE_UNSUPPORTED":
      return withCorrelation(copy.orderCounterpartyTypeUnsupported, serverMessage);
    case "ORDER_PAYMENT_CONFIGURATION_INVALID":
      return withCorrelation(copy.orderPaymentConfigurationInvalid, serverMessage);
    case "ORDER_FULFILLMENT_CONFIGURATION_INVALID":
      return withCorrelation(copy.orderFulfillmentConfigurationInvalid, serverMessage);
    case "ORDER_CONTRACT_INVALID":
      return withCorrelation(copy.orderContractInvalid, serverMessage);
    case "ORDER_PAYLOAD_VALIDATION_FAILED":
      return withCorrelation(copy.orderPayloadValidationFailed, serverMessage);
    case "ORDER_1C_VALIDATION_FAILED":
      return copy.orderOneCValidationFailed;
    case "ORDER_SUBMISSION_INFRASTRUCTURE_FAILURE":
    case "ORDER_UNKNOWN_FAILURE":
      return copy.orderInfrastructureFailure;
    default:
      return copy.retryOrContact;
  }
}

function withCorrelation(message: string, serverMessage: string): string {
  const correlationCode = serverMessage.match(/ORD-[A-F0-9]{8}/)?.[0];
  return correlationCode ? `${message} ${correlationCode}` : message;
}
