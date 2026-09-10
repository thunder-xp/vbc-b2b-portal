"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getOrdersCopy, usePartnerLocale } from "../../partner-locale";
import { getPartnerOrderReconciliationStateAction } from "../actions/order.actions";
import type { PartnerOrderReconciliationStateDto } from "../services";

export const ORDER_RECONCILIATION_POLL_INTERVAL_MS = 5_000;
export const ORDER_RECONCILIATION_POLL_DURATION_MS = 10 * 60 * 1_000;

type Props = {
  initialState: PartnerOrderReconciliationStateDto | null;
  stale?: boolean;
  surface: "cart" | "order";
};

export function OrderReconciliationStatus({
  initialState,
  stale = false,
  surface,
}: Props) {
  const [observedState, setObservedState] = useState<PartnerOrderReconciliationStateDto | null>(null);
  const [timedOut, setTimedOut] = useState(stale);
  const locale = usePartnerLocale();
  const copy = getOrdersCopy(locale);
  const router = useRouter();
  const state = initialState
    && observedState?.orderId !== initialState.orderId
    ? initialState
    : observedState ?? initialState;
  const orderId = state?.orderId ?? null;
  const stateKind = state?.state ?? null;

  useEffect(() => {
    if (!orderId || !stateKind || !isChecking(stateKind) || stale) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = Date.now() + ORDER_RECONCILIATION_POLL_DURATION_MS;

    const schedule = () => {
      if (cancelled) return;
      if (Date.now() >= deadline) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(check, ORDER_RECONCILIATION_POLL_INTERVAL_MS);
    };
    const check = async () => {
      const result = await getPartnerOrderReconciliationStateAction(orderId);
      if (cancelled) return;
      if (!result.success) {
        schedule();
        return;
      }
      if (result.data.state === "confirmed_created") {
        router.replace(`/cabinet/orders/${result.data.orderId}?submitted=1`);
        return;
      }
      setObservedState(result.data);
      if (isChecking(result.data.state)) {
        schedule();
        return;
      }
      router.refresh();
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, router, stale, stateKind]);

  if (!state) return null;

  if (state.state === "confirmed_not_created") {
    return (
      <div
        className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
        role="status"
      >
        <p className="font-semibold">{copy.orderConfirmedNotCreated}</p>
        {surface === "order" ? (
          <Link
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-emerald-800 underline underline-offset-4"
            href="/cabinet/cart"
            prefetch={false}
          >
            {copy.returnToCart}
          </Link>
        ) : null}
      </div>
    );
  }

  if (state.state === "manual_review_required" || state.state === "failed" || timedOut) {
    return (
      <div
        className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        role="status"
      >
        <p className="font-semibold">
          {timedOut ? copy.cartReconciliationStale : copy.orderManualReviewRequired}
        </p>
      </div>
    );
  }

  if (state.state === "confirmed_created") return null;

  return (
    <div
      aria-live="polite"
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      <p className="font-semibold">{copy.orderReconciliationChecking}</p>
      <p className="mt-1">{copy.orderReconciliationCheckingMessage}</p>
      <p className="mt-1 text-xs text-amber-800">
        {copy.orderReconciliationUsuallyTakesMinutes}
      </p>
    </div>
  );
}

function isChecking(
  state: PartnerOrderReconciliationStateDto["state"],
): state is "checking" | "unknown_retrying" {
  return state === "checking" || state === "unknown_retrying";
}
