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
  const {
    flushPendingMutations,
    hasPendingMutations,
  } = useCartCheckoutCoordinator();

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
      !state.success
      && isDefinitiveRecoverableFailure(state.errorCode)
      && submissionKeyRef.current
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
    if (actionPending || phase === "validating" || phase === "submitting") return;

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
        setBarrierError(
          "Не удалось сохранить изменения корзины. Проверьте количество в отмеченной позиции и повторите попытку.",
        );
      }
    })();
  };

  const retryBlocked = !state.success
    && ["ORDER_IN_PROGRESS", "ORDER_RECONCILIATION_REQUIRED"].includes(
      state.errorCode,
    );
  const busy = actionPending
    || hasPendingMutations
    || phase === "cart_update_pending"
    || phase === "validating";

  return (
    <form
      action={action}
      aria-label="Проверка и отправка заказа"
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
        <h2 className="font-semibold text-zinc-950">Проверка заказа</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          Проверьте состав, количество и итоговую сумму перед отправкой.
        </p>
      </div>
      <label className="block text-sm font-medium text-zinc-800">
        Дата планируемой отгрузки
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
          Выбрано: {formatRussianBusinessDate(deliveryDate)}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-zinc-600">
        До этой даты оборудование планируется удерживать под ваш заказ.
        Менеджер Novotech свяжется с вами для подтверждения отгрузки.
      </p>
      <p className="rounded-md bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
        Заказ будет передан в 1С Novotech. После обработки статус появится в
        разделе «Заказы».
      </p>
      <button
        className="h-11 w-full rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy || retryBlocked}
        type="submit"
      >
        {submitLabel(phase, actionPending, hasPendingMutations)}
      </button>
      {hasPendingMutations ? (
        <p aria-live="polite" className="text-sm text-amber-800">
          Сохраняем изменения корзины…
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
          {state.message}
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

export function formatRussianBusinessDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function submitLabel(
  phase: CheckoutPhase,
  actionPending: boolean,
  hasPendingMutations: boolean,
): string {
  if (actionPending || phase === "submitting") return "Отправляем заказ…";
  if (phase === "validating") return "Проверяем заказ…";
  if (phase === "cart_update_pending" || hasPendingMutations) {
    return "Сохраняем корзину…";
  }
  return "Отправить заказ";
}

function isDefinitiveRecoverableFailure(code: string | null): boolean {
  return code !== null && ![
    "ORDER_IN_PROGRESS",
    "ORDER_RECONCILIATION_REQUIRED",
    "ORDER_1C_TIMEOUT",
    "ORDER_1C_ALREADY_CREATED",
    "ORDER_READBACK_FAILED",
  ].includes(code);
}
