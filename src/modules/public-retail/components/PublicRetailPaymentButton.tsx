"use client";

import { useState, useTransition } from "react";

import { initiateRetailPaymentAction } from "../actions/retail-payment.actions";
import type { PublicRetailLocale } from "../types";

export function PublicRetailPaymentButton({ orderToken, locale }: { orderToken: string; locale: PublicRetailLocale }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [outcome, setOutcome] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ru = locale === "ru";

  function initiate() {
    if (pending) return;
    startTransition(async () => {
      const result = await initiateRetailPaymentAction({ orderToken, idempotencyKey });
      if (result.outcome === "SUCCESS" && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setOutcome(result.outcome);
    });
  }

  return <div className="border border-zinc-200 bg-white p-5">
    <h2 className="font-semibold">{ru ? "Оплата картой" : "Plată cu cardul"}</h2>
    <p className="mt-2 text-sm leading-5 text-zinc-600">{ru ? "Переход на защищённую платёжную страницу MAIB." : "Veți fi redirecționat către pagina de plată securizată MAIB."}</p>
    <button className="mt-4 min-h-11 w-full bg-emerald-700 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-zinc-400" disabled={pending} onClick={initiate} type="button">
      {pending ? (ru ? "Подготовка…" : "Se pregătește…") : (ru ? "Перейти к оплате" : "Continuă spre plată")}
    </button>
    {outcome ? <p className="mt-3 text-sm text-red-700" role="alert">{paymentError(outcome, ru)}</p> : null}
  </div>;
}

function paymentError(outcome: string, ru: boolean) {
  if (outcome === "PAYMENT_ATTEMPT_EXISTS") return ru ? "Платёж уже подготавливается. Обновите страницу через несколько секунд." : "Plata este deja în curs de pregătire. Actualizați pagina peste câteva secunde.";
  if (outcome === "INVALID_ORDER_STATE") return ru ? "Этот заказ больше не ожидает оплату." : "Această comandă nu mai așteaptă plata.";
  if (outcome === "UNPRICED_ORDER" || outcome === "NOT_ELIGIBLE") return ru ? "Заказ сейчас нельзя оплатить картой." : "Comanda nu poate fi plătită acum cu cardul.";
  return ru ? "Не удалось подготовить платёж. Попробуйте позже." : "Plata nu a putut fi pregătită. Încercați mai târziu.";
}
