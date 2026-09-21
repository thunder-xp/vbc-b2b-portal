"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { initiateRetailPaymentAction } from "../actions/retail-payment.actions";
import type { PublicRetailLocale } from "../types";

export function PublicRetailPaymentButton({ orderToken, locale, reviewMode = false }: { orderToken: string; locale: PublicRetailLocale; reviewMode?: boolean }) {
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
    {reviewMode ? <p className="mb-3 w-fit bg-amber-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">MAIB Sandbox · Review</p> : null}
    <h2 className="font-semibold">{ru ? "Банковская карта" : "Card bancar"}</h2>
    <p className="mt-1 text-sm font-semibold text-blue-800">MAIB Checkout</p>
    <p className="mt-2 text-sm leading-5 text-zinc-600">{ru ? "Переход на защищённую платёжную страницу MAIB." : "Veți fi redirecționat către pagina de plată securizată MAIB."}</p>
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs font-semibold text-blue-800"><Link className="underline underline-offset-4" href={`/terms?lang=${locale}`} target="_blank">{ru ? "Условия" : "Termeni"}</Link><Link className="underline underline-offset-4" href={`/privacy?lang=${locale}`} target="_blank">{ru ? "Конфиденциальность" : "Confidențialitate"}</Link><Link className="underline underline-offset-4" href={`/delivery?lang=${locale}`} target="_blank">{ru ? "Доставка" : "Livrare"}</Link><Link className="underline underline-offset-4" href={`/returns?lang=${locale}`} target="_blank">{ru ? "Возврат" : "Retur"}</Link><Link className="underline underline-offset-4" href={`/contacts?lang=${locale}`} target="_blank">{ru ? "Контакты" : "Contacte"}</Link></div>
    <button className="mt-4 min-h-11 w-full bg-emerald-700 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-zinc-400" disabled={pending} onClick={initiate} type="button">
      {pending ? (ru ? "Подготовка…" : "Se pregătește…") : (ru ? "Перейти к оплате" : "Continuă spre plată")}
    </button>
    {outcome ? <p className="mt-3 text-sm text-red-700" role="alert">{paymentError(outcome, ru)}</p> : null}
  </div>;
}

function paymentError(outcome: string, ru: boolean) {
  if (outcome === "PAYMENT_ATTEMPT_EXISTS") return ru ? "Платёж уже подготавливается. Обновите страницу через несколько секунд." : "Plata este deja în curs de pregătire. Actualizați pagina peste câteva secunde.";
  if (outcome === "INVALID_ORDER_STATE") return ru ? "Этот заказ больше не ожидает оплату." : "Această comandă nu mai așteaptă plata.";
  if (outcome === "TERMS_NOT_ACCEPTED") return ru ? "Для оплаты требуется принять актуальные Условия и Политику конфиденциальности." : "Pentru plată trebuie acceptate Termenii și Politica de confidențialitate actuale.";
  if (outcome === "EMAIL_REQUIRED") return ru ? "Для подтверждения оплаты нужен корректный email заказа." : "Pentru confirmarea plății este necesar un email corect al comenzii.";
  if (outcome === "CONTENT_NOT_ELIGIBLE") return ru ? "Один или несколько товаров пока недоступны для онлайн-оплаты. Свяжитесь с Novotech для оформления заказа." : "Unul sau mai multe produse nu sunt încă eligibile pentru plata online. Contactați Novotech pentru plasarea comenzii.";
  if (outcome === "UNPRICED_ORDER" || outcome === "NOT_ELIGIBLE") return ru ? "Заказ сейчас нельзя оплатить картой." : "Comanda nu poate fi plătită acum cu cardul.";
  return ru ? "Не удалось подготовить платёж. Попробуйте позже." : "Plata nu a putut fi pregătită. Încercați mai târziu.";
}
