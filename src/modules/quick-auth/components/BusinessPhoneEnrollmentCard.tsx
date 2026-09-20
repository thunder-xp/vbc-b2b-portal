"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { PublicLocale } from "@/src/modules/public-locale";

import {
  resendBusinessPhoneEnrollmentAction,
  startBusinessPhoneEnrollmentAction,
  verifyBusinessPhoneEnrollmentAction,
} from "../enrollment.actions";
import type { BusinessProfilePhoneStateCode } from "../profile-phone-state";
import type { BusinessPhoneEnrollmentPublicState } from "../enrollment.types";

const copy = {
  ru: {
    title: "Подтверждение номера",
    intro: "SMS-код будет отправлен на номер, сохранённый в профиле.",
    target: "Номер профиля",
    send: "Отправить SMS-код",
    sending: "Отправляем…",
    otpTitle: "Код подтверждения",
    otpBody: "Мы отправили код на номер:",
    code: "Код из SMS",
    verify: "Подтвердить",
    verifying: "Проверяем…",
    resend: "Повторить код",
    wait: (seconds: number) => `Повторная отправка через ${seconds} сек.`,
    confirmed: "Номер уже подтверждён.",
    confirmedBody: "Этот номер используется для быстрого входа по SMS.",
    conflict: "Номер связан с другой учётной записью",
    conflictBody: "SMS-код не отправлен. Используйте другой номер в профиле или обратитесь в Novotech.",
    notSet: "Номер телефона не указан",
    notSetBody: "Вернитесь в профиль, введите номер телефона и сохраните изменения.",
    back: "Вернуться в профиль",
    continue: "Продолжить",
    invalidPhone: "Сохраните действительный номер телефона Молдовы в профиле.",
    invalidCode: "Код не подошёл или истёк. Проверьте код и попробуйте снова.",
    rateLimited: "Слишком много попыток. Повторите позже.",
    sendUnavailable: "Не удалось отправить SMS-код. Попробуйте ещё раз.",
    verificationUnavailable: "Не удалось подтвердить номер. Попробуйте ещё раз.",
  },
  ro: {
    title: "Confirmarea numărului",
    intro: "Codul SMS va fi trimis la numărul salvat în profil.",
    target: "Numărul din profil",
    send: "Trimite codul SMS",
    sending: "Se trimite…",
    otpTitle: "Cod de confirmare",
    otpBody: "Am trimis codul la numărul:",
    code: "Codul din SMS",
    verify: "Confirmă",
    verifying: "Se verifică…",
    resend: "Retrimite codul",
    wait: (seconds: number) => `Retrimitere peste ${seconds} sec.`,
    confirmed: "Numărul este deja confirmat.",
    confirmedBody: "Acest număr este utilizat pentru autentificarea rapidă prin SMS.",
    conflict: "Numărul este asociat altui cont",
    conflictBody: "Codul SMS nu a fost trimis. Utilizați alt număr în profil sau contactați Novotech.",
    notSet: "Numărul de telefon nu este indicat",
    notSetBody: "Reveniți la profil, introduceți numărul de telefon și salvați modificările.",
    back: "Înapoi la profil",
    continue: "Continuă",
    invalidPhone: "Salvați în profil un număr de telefon valid din Moldova.",
    invalidCode: "Codul este incorect sau a expirat. Verificați-l și încercați din nou.",
    rateLimited: "Prea multe încercări. Încercați din nou mai târziu.",
    sendUnavailable: "Codul SMS nu a putut fi trimis. Încercați din nou.",
    verificationUnavailable: "Numărul nu a putut fi confirmat. Încercați din nou.",
  },
} as const;

type Step = "TARGET" | "OTP" | "CONFIRMED" | "CONFLICT" | "NOT_SET";

export function BusinessPhoneEnrollmentCard({
  initialState,
  locale,
  nextPath,
  targetPhone,
}: {
  initialState: BusinessProfilePhoneStateCode;
  locale: PublicLocale;
  nextPath: string;
  targetPhone: string | null;
}) {
  const labels = copy[locale];
  const router = useRouter();
  const [step, setStep] = useState<Step>(() => initialStep(initialState));
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function start() {
    setPending(true);
    setError(null);
    try {
      applyState(await startBusinessPhoneEnrollmentAction(), labels.sendUnavailable);
    } catch {
      setError(labels.sendUnavailable);
    } finally {
      setPending(false);
    }
  }

  async function verify() {
    if (!challengeId) return;
    setPending(true);
    setError(null);
    try {
      applyState(
        await verifyBusinessPhoneEnrollmentAction(challengeId, otp),
        labels.verificationUnavailable,
      );
    } catch {
      setError(labels.verificationUnavailable);
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    if (!challengeId || cooldown > 0) return;
    setPending(true);
    setError(null);
    try {
      applyState(await resendBusinessPhoneEnrollmentAction(challengeId), labels.sendUnavailable);
    } catch {
      setError(labels.sendUnavailable);
    } finally {
      setPending(false);
    }
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
      setStep("OTP");
      return;
    }
    setStep("CONFIRMED");
    router.refresh();
  }

  return (
    <section aria-labelledby="business-phone-enrollment-title" className="grid gap-4">
      {step === "TARGET" ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950" id="business-phone-enrollment-title">{labels.title}</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{labels.intro}</p>
          </div>
          <dl className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <dt className="text-xs font-medium text-zinc-500">{labels.target}</dt>
            <dd className="mt-1 font-mono text-base font-semibold text-zinc-950">{targetPhone}</dd>
          </dl>
          <ErrorMessage message={error} />
          <button className={primaryButton} disabled={pending} onClick={() => void start()} type="button">
            {pending ? labels.sending : labels.send}
          </button>
          <Link className={secondaryLink} href={nextPath}>{labels.back}</Link>
        </>
      ) : null}

      {step === "OTP" ? (
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void verify(); }}>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950" id="business-phone-enrollment-title">{labels.otpTitle}</h1>
            <p className="mt-2 text-sm text-zinc-600">{labels.otpBody} <span className="font-medium text-zinc-900">{maskedPhone}</span></p>
          </div>
          <label className="grid gap-2 text-sm font-medium text-zinc-800" htmlFor="business-phone-enrollment-otp">
            {labels.code}
            <input
              aria-label={labels.code}
              autoComplete="one-time-code"
              autoFocus
              className="min-h-14 rounded-lg border border-zinc-300 px-4 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="business-phone-enrollment-otp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              pattern="[0-9]{6}"
              required
              type="text"
              value={otp}
            />
          </label>
          <ErrorMessage message={error} />
          <button className={primaryButton} disabled={pending || otp.length !== 6} type="submit">{pending ? labels.verifying : labels.verify}</button>
          <button className={textButton} disabled={pending || cooldown > 0} onClick={() => void resend()} type="button">{cooldown > 0 ? labels.wait(cooldown) : labels.resend}</button>
          <Link className={secondaryLink} href={nextPath}>{labels.back}</Link>
        </form>
      ) : null}

      {step === "CONFIRMED" ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950" id="business-phone-enrollment-title">{labels.confirmed}</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{labels.confirmedBody}</p>
          </div>
          <Link className={primaryLink} href={nextPath}>{labels.continue}</Link>
        </>
      ) : null}

      {step === "CONFLICT" ? (
        <StateMessage body={labels.conflictBody} label={labels.back} nextPath={nextPath} title={labels.conflict} />
      ) : null}
      {step === "NOT_SET" ? (
        <StateMessage body={labels.notSetBody} label={labels.back} nextPath={nextPath} title={labels.notSet} />
      ) : null}
    </section>
  );
}

function StateMessage({ body, label, nextPath, title }: { body: string; label: string; nextPath: string; title: string }) {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950" id="business-phone-enrollment-title">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
      </div>
      <Link className={primaryLink} href={nextPath}>{label}</Link>
    </>
  );
}

const primaryButton = "min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400";
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
  if (error === "PHONE_CONFLICT") return labels.conflictBody;
  if (error === "RATE_LIMITED") return labels.rateLimited;
  return unavailableMessage;
}

function initialStep(state: BusinessProfilePhoneStateCode): Step {
  if (state === "VERIFIED") return "CONFIRMED";
  if (state === "CONFLICT") return "CONFLICT";
  if (state === "NOT_SET") return "NOT_SET";
  return "TARGET";
}
