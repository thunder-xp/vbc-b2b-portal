"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { PublicLocale } from "@/src/modules/public-locale";

import {
  resendBusinessPhoneEnrollmentAction,
  startBusinessPhoneEnrollmentAction,
  verifyBusinessPhoneEnrollmentAction,
} from "../enrollment.actions";
import type { BusinessPhoneEnrollmentPublicState } from "../enrollment.types";

const copy = {
  ru: {
    title: "Быстрый вход по телефону",
    intro: "Подтвердите номер один раз, чтобы в следующий раз входить по SMS-коду.",
    connected: "Быстрый вход подключён",
    connectedBody: "Подтверждённый номер можно использовать для безопасного входа по SMS-коду.",
    confirmPhone: "Подтвердить номер",
    changePhone: "Изменить номер",
    later: "Позже",
    phone: "Телефон",
    phoneHint: "8 цифр после +373",
    send: "Отправить код",
    sending: "Отправляем…",
    otpTitle: "Код подтверждения",
    otpBody: "Мы отправили код на номер:",
    code: "Код из SMS",
    verify: "Подтвердить",
    verifying: "Проверяем…",
    resend: "Повторить код",
    wait: (seconds: number) => `Повторная отправка через ${seconds} сек.`,
    edit: "Изменить номер",
    confirmed: "Номер подтверждён. Быстрый вход доступен.",
    continue: "Продолжить",
    invalidPhone: "Введите 8 цифр молдавского номера.",
    invalidCode: "Код не подошёл или истёк. Проверьте код и попробуйте снова.",
    conflict: "Этот номер уже связан с другой учётной записью. Обратитесь в Novotech, если считаете это ошибкой.",
    rateLimited: "Слишком много попыток. Повторите позже.",
    sendUnavailable: "Не удалось отправить SMS-код. Попробуйте ещё раз.",
    verificationUnavailable: "Не удалось подтвердить номер. Попробуйте ещё раз.",
  },
  ro: {
    title: "Autentificare rapidă prin telefon",
    intro: "Confirmați numărul o singură dată pentru a vă autentifica ulterior cu un cod SMS.",
    connected: "Autentificarea rapidă este conectată",
    connectedBody: "Numărul confirmat poate fi folosit pentru autentificare sigură prin cod SMS.",
    confirmPhone: "Confirmă numărul",
    changePhone: "Schimbă numărul",
    later: "Mai târziu",
    phone: "Telefon",
    phoneHint: "8 cifre după +373",
    send: "Trimite codul",
    sending: "Se trimite…",
    otpTitle: "Cod de confirmare",
    otpBody: "Am trimis codul la numărul:",
    code: "Codul din SMS",
    verify: "Confirmă",
    verifying: "Se verifică…",
    resend: "Retrimite codul",
    wait: (seconds: number) => `Retrimitere peste ${seconds} sec.`,
    edit: "Schimbă numărul",
    confirmed: "Numărul a fost confirmat. Autentificarea rapidă este disponibilă.",
    continue: "Continuă",
    invalidPhone: "Introduceți cele 8 cifre ale numărului din Moldova.",
    invalidCode: "Codul este incorect sau a expirat. Verificați-l și încercați din nou.",
    conflict: "Acest număr este deja asociat altui cont. Contactați Novotech dacă considerați că este o eroare.",
    rateLimited: "Prea multe încercări. Încercați din nou mai târziu.",
    sendUnavailable: "Codul SMS nu a putut fi trimis. Încercați din nou.",
    verificationUnavailable: "Numărul nu a putut fi confirmat. Încercați din nou.",
  },
} as const;

type Step = "INTRO" | "PHONE" | "OTP" | "CONFIRMED";

export function BusinessPhoneEnrollmentCard({
  confirmed,
  locale,
  nextPath,
}: {
  confirmed: boolean;
  locale: PublicLocale;
  nextPath: string;
}) {
  const labels = copy[locale];
  const [step, setStep] = useState<Step>(confirmed ? "CONFIRMED" : "INTRO");
  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const localDigits = useMemo(() => toLocalDigits(phone), [phone]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function start() {
    setPending(true); setError(null);
    try { applyState(await startBusinessPhoneEnrollmentAction(localDigits), labels.sendUnavailable); }
    catch { setError(labels.sendUnavailable); }
    finally { setPending(false); }
  }

  async function verify() {
    if (!challengeId) return;
    setPending(true); setError(null);
    try { applyState(await verifyBusinessPhoneEnrollmentAction(challengeId, localDigits, otp), labels.verificationUnavailable); }
    catch { setError(labels.verificationUnavailable); }
    finally { setPending(false); }
  }

  async function resend() {
    if (!challengeId || cooldown > 0) return;
    setPending(true); setError(null);
    try { applyState(await resendBusinessPhoneEnrollmentAction(challengeId, localDigits), labels.sendUnavailable); }
    catch { setError(labels.sendUnavailable); }
    finally { setPending(false); }
  }

  function applyState(result: BusinessPhoneEnrollmentPublicState, unavailableMessage: string) {
    if (!result.ok) {
      setError(errorMessage(result.error, labels, unavailableMessage));
      return;
    }
    setError(null);
    if (result.step === "OTP") {
      setChallengeId(result.challengeId);
      setMaskedPhone(result.maskedPhone);
      setCooldown(60);
    }
    setStep(result.step);
  }

  return (
    <section className="grid gap-4" aria-labelledby="business-phone-enrollment-title">
      {step === "INTRO" ? <>
        <div><h1 className="text-2xl font-semibold tracking-tight text-zinc-950" id="business-phone-enrollment-title">{labels.title}</h1><p className="mt-2 text-sm leading-6 text-zinc-600">{labels.intro}</p></div>
        <button className={primaryButton} onClick={() => setStep("PHONE")} type="button">{labels.confirmPhone}</button>
        <Link className={secondaryLink} href={nextPath}>{labels.later}</Link>
      </> : null}

      {step === "PHONE" ? <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void start(); }}>
        <div><h1 className="text-2xl font-semibold tracking-tight text-zinc-950" id="business-phone-enrollment-title">{labels.title}</h1><p className="mt-2 text-sm leading-6 text-zinc-600">{labels.intro}</p></div>
        <label className="grid gap-2 text-sm font-medium text-zinc-800" htmlFor="business-phone-enrollment-phone">{labels.phone}<span className="flex min-h-12 overflow-hidden rounded-lg border border-zinc-300 bg-white focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-100"><span className="flex items-center border-r border-zinc-200 bg-zinc-50 px-3 font-semibold text-zinc-700">+373</span><input aria-describedby="business-phone-enrollment-hint" aria-label={labels.phone} autoComplete="tel" autoFocus className="min-w-0 flex-1 px-3 text-base tracking-wide outline-none" id="business-phone-enrollment-phone" inputMode="tel" maxLength={16} onChange={(event) => setPhone(event.target.value)} placeholder="__ ___ ___" required type="tel" value={phone} /></span><span className="text-xs font-normal text-zinc-500" id="business-phone-enrollment-hint">{labels.phoneHint}</span></label>
        <ErrorMessage message={error} />
        <button className={primaryButton} disabled={pending || localDigits.length !== 8} type="submit">{pending ? labels.sending : labels.send}</button>
        <Link className={secondaryLink} href={nextPath}>{labels.later}</Link>
      </form> : null}

      {step === "OTP" ? <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void verify(); }}>
        <div><h1 className="text-2xl font-semibold tracking-tight text-zinc-950" id="business-phone-enrollment-title">{labels.otpTitle}</h1><p className="mt-2 text-sm text-zinc-600">{labels.otpBody} <span className="font-medium text-zinc-900">{maskedPhone}</span></p></div>
        <label className="grid gap-2 text-sm font-medium text-zinc-800" htmlFor="business-phone-enrollment-otp">{labels.code}<input aria-label={labels.code} autoComplete="one-time-code" autoFocus className="min-h-14 rounded-lg border border-zinc-300 px-4 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="business-phone-enrollment-otp" inputMode="numeric" maxLength={6} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required type="text" value={otp} /></label>
        <ErrorMessage message={error} />
        <button className={primaryButton} disabled={pending || otp.length !== 6} type="submit">{pending ? labels.verifying : labels.verify}</button>
        <button className={textButton} disabled={pending || cooldown > 0} onClick={() => void resend()} type="button">{cooldown > 0 ? labels.wait(cooldown) : labels.resend}</button>
        <button className={textButton} disabled={pending} onClick={() => { setStep("PHONE"); setChallengeId(null); setOtp(""); setCooldown(0); }} type="button">{labels.edit}</button>
        <Link className={secondaryLink} href={nextPath}>{labels.later}</Link>
      </form> : null}

      {step === "CONFIRMED" ? <>
        <div><h1 className="text-2xl font-semibold tracking-tight text-zinc-950" id="business-phone-enrollment-title">{labels.connected}</h1><p className="mt-2 text-sm leading-6 text-zinc-600">{confirmed ? labels.connectedBody : labels.confirmed}</p></div>
        {confirmed ? <button className={secondaryButton} onClick={() => setStep("PHONE")} type="button">{labels.changePhone}</button> : null}
        <Link className={primaryLink} href={nextPath}>{labels.continue}</Link>
      </> : null}
    </section>
  );
}

const primaryButton = "min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400";
const secondaryButton = "min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50";
const primaryLink = "flex min-h-11 items-center justify-center rounded-lg bg-zinc-950 px-4 text-center text-sm font-semibold text-white hover:bg-zinc-800";
const secondaryLink = "flex min-h-11 items-center justify-center text-center text-sm font-semibold text-emerald-700 hover:text-emerald-900";
const textButton = "min-h-11 font-medium text-emerald-700 hover:text-emerald-900 disabled:text-zinc-400";

function ErrorMessage({ message }: { message: string | null }) {
  return message ? <p aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{message}</p> : null;
}

function errorMessage(
  error: Extract<BusinessPhoneEnrollmentPublicState, { ok: false }>["error"],
  labels: typeof copy.ru | typeof copy.ro,
  unavailableMessage: string,
) {
  if (error === "INVALID_PHONE") return labels.invalidPhone;
  if (error === "INVALID_CODE") return labels.invalidCode;
  if (error === "PHONE_CONFLICT") return labels.conflict;
  if (error === "RATE_LIMITED") return labels.rateLimited;
  return unavailableMessage;
}

function toLocalDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("373")) return digits.slice(3);
  if (digits.length === 9 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}
