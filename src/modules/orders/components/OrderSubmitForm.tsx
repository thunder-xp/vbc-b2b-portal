"use client";

import {
  type FormEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "../../access-control/actions/action-result";
import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { getCartCheckoutIntentAction } from "../actions/cart.actions";
import {
  submitCartOrderAction,
  type PartnerOrderSubmissionReceipt,
} from "../actions/order.actions";
import { useCartCheckoutCoordinator } from "./CartCheckoutCoordinator";
import { getOrdersCopy, usePartnerLocale } from "../../partner-locale";

const initial: ActionResult<PartnerOrderSubmissionReceipt | null> = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};

type CheckoutPhase =
  | "idle"
  | "cart_update_pending"
  | "validating"
  | "submitting"
  | "failed_retryable";

export function OrderSubmitForm({
  cartId,
  intentVersion,
  submissionKey,
}: {
  cartId?: string;
  intentVersion?: number;
  submissionKey: string;
}) {
  const [state, action, actionPending] = useActionState(
    submitCartOrderAction,
    initial,
  );
  const locale = usePartnerLocale();
  const copy = getOrdersCopy(locale);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [checkoutIntentVersion, setCheckoutIntentVersion] = useState(
    intentVersion ?? 0,
  );
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const [barrierError, setBarrierError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const submissionKeyRef = useRef<HTMLInputElement>(null);
  const intentVersionRef = useRef<HTMLInputElement>(null);
  const bypassBarrierRef = useRef(false);
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
    if (bypassBarrierRef.current) {
      bypassBarrierRef.current = false;
      setPhase("idle");
      return;
    }

    event.preventDefault();
    if (actionPending || phase === "validating" || phase === "submitting")
      return;

    setBarrierError("");
    setPhase("cart_update_pending");
    void (async () => {
      const barrierStartedAt = performance.now();
      try {
        await flushPendingMutations();
        setPhase("validating");
        if (cartId) {
          const currentIntent = await getCartCheckoutIntentAction(cartId);
          if (!currentIntent.success || !intentVersionRef.current) {
            throw new Error("Cart intent could not be confirmed.");
          }
          setCheckoutIntentVersion(currentIntent.data.intentVersion);
          intentVersionRef.current.value = String(
            currentIntent.data.intentVersion,
          );
        }
        console.info({
          event: "checkout_mutation_barrier_completed",
          durationMs: Math.round(performance.now() - barrierStartedAt),
        });
        bypassBarrierRef.current = true;
        formRef.current?.requestSubmit();
      } catch {
        setPhase("failed_retryable");
        setBarrierError(copy.cartBarrierError);
      }
    })();
  };

  const retryBlocked =
    !state.success &&
    ["ORDER_IN_PROGRESS", "ORDER_RECONCILIATION_REQUIRED"].includes(
      state.errorCode,
    );
  const busy =
    actionPending ||
    hasPendingMutations ||
    phase === "cart_update_pending" ||
    phase === "validating";

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
        ref={intentVersionRef}
        type="hidden"
        value={checkoutIntentVersion || ""}
      />
      <input
        defaultValue={submissionKey}
        name="submissionKey"
        ref={submissionKeyRef}
        type="hidden"
      />
      <div>
        <h2 className="font-semibold text-zinc-950">{copy.checkoutReview}</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          {copy.checkoutReviewHint}
        </p>
      </div>
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
      <p className="text-xs leading-5 text-zinc-600">{copy.reservationHint}</p>
      <p className="rounded-md bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
        {copy.oneCSubmissionHint}
      </p>
      <button
        className="h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy || retryBlocked}
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
  if (actionPending || phase === "submitting") return copy.sendingOrder;
  if (phase === "validating") return copy.validatingOrder;
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
