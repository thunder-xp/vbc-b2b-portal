"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { PublicLocale } from "@/src/modules/public-locale";

import {
  resendQuickAuthOtpAction,
  startQuickAuthAction,
  submitBusinessQuickAuthEmailAction,
  verifyQuickAuthOtpAction,
} from "../actions";
import type { QuickAuthPublicState } from "../types";

const copy = {
  ru: {
    phone: "Телефон", phoneHint: "8 цифр после +373", continue: "Продолжить", sending: "Отправляем…",
    emailTitle: "Введите email", emailBody: "Подтвердите email, связанный с этой учётной записью.", email: "Email",
    otpTitle: "Код подтверждения", otpBody: "Мы отправили код на номер:", code: "Код из SMS", verify: "Подтвердить", verifying: "Проверяем…",
    resend: "Повторить код", wait: (seconds: number) => `Повторная отправка через ${seconds} сек.`, edit: "Изменить номер",
    classic: "Войти с email и паролем", notRegisteredTitle: "Ваш личный кабинет ещё не активирован",
    notRegisteredBody: "К сожалению, вы ещё не зарегистрированы на платформе Novotech. Личный кабинет активируется автоматически после первой покупки оборудования или системы.",
    catalog: "Перейти в каталог", blockedTitle: "Быстрый вход сейчас недоступен",
    blockedBody: "Воспользуйтесь входом с email и паролем или обратитесь в службу поддержки.",
    invalidPhone: "Введите 8 цифр молдавского номера.", invalidEmail: "Введите корректный email.", identityMismatch: "Не удалось подтвердить данные для входа. Проверьте email или войдите с email и паролем.", invalidCode: "Код не подошёл или истёк. Проверьте код и попробуйте снова.",
    expired: "Сессия входа истекла. Начните снова.", rateLimited: "Слишком много попыток. Повторите позже.",
    unavailable: "Не удалось продолжить вход. Попробуйте ещё раз.",
  },
  ro: {
    phone: "Telefon", phoneHint: "8 cifre după +373", continue: "Continuă", sending: "Se trimite…",
    emailTitle: "Introduceți emailul", emailBody: "Confirmați emailul asociat acestui cont.", email: "Email",
    otpTitle: "Cod de confirmare", otpBody: "Am trimis codul la numărul:", code: "Codul din SMS", verify: "Confirmă", verifying: "Se verifică…",
    resend: "Retrimite codul", wait: (seconds: number) => `Retrimitere peste ${seconds} sec.`, edit: "Schimbă numărul",
    classic: "Autentificare cu email și parolă", notRegisteredTitle: "Contul personal nu este încă activat",
    notRegisteredBody: "Din păcate, nu sunteți încă înregistrat pe platforma Novotech. Contul personal se activează automat după prima achiziție de echipament sau sistem.",
    catalog: "Deschide catalogul", blockedTitle: "Autentificarea rapidă nu este disponibilă acum",
    blockedBody: "Folosiți autentificarea cu email și parolă sau contactați serviciul de asistență.",
    invalidPhone: "Introduceți cele 8 cifre ale numărului din Moldova.", invalidEmail: "Introduceți un email valid.", identityMismatch: "Datele de autentificare nu au putut fi confirmate. Verificați emailul sau autentificați-vă cu email și parolă.", invalidCode: "Codul este incorect sau a expirat. Verificați-l și încercați din nou.",
    expired: "Sesiunea de autentificare a expirat. Începeți din nou.", rateLimited: "Prea multe încercări. Încercați din nou mai târziu.",
    unavailable: "Autentificarea nu a putut continua. Încercați din nou.",
  },
} as const;

type Step = "PHONE" | "EMAIL" | "OTP" | "NOT_REGISTERED" | "BLOCKED";

export function QuickAuthCard({ locale }: { locale: PublicLocale }) {
  const labels = copy[locale];
  const router = useRouter();
  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
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
    try { applyState(await startQuickAuthAction(localDigits)); }
    catch { setError(labels.unavailable); }
    finally { setPending(false); }
  }

  async function submitEmail() {
    if (!challengeId) return;
    setPending(true); setError(null);
    try { applyState(await submitBusinessQuickAuthEmailAction(challengeId, localDigits, email)); }
    catch { setError(labels.unavailable); }
    finally { setPending(false); }
  }

  async function verify() {
    if (!challengeId) return;
    setPending(true); setError(null);
    try {
      const result = await verifyQuickAuthOtpAction(challengeId, localDigits, otp, locale);
      if (result.ok && result.step === "AUTHENTICATED") {
        router.replace(result.redirectTo);
        router.refresh();
      } else applyState(result);
    } catch { setError(labels.unavailable); }
    finally { setPending(false); }
  }

  async function resend() {
    if (!challengeId || cooldown > 0) return;
    setPending(true); setError(null);
    try { applyState(await resendQuickAuthOtpAction(challengeId, localDigits)); }
    catch { setError(labels.unavailable); }
    finally { setPending(false); }
  }

  function applyState(result: QuickAuthPublicState) {
    if (!result.ok) {
      setError(errorMessage(result.error, labels));
      if (result.error === "EXPIRED") reset();
      return;
    }
    setError(null);
    if (result.step === "OTP" || result.step === "EMAIL") {
      setChallengeId(result.challengeId);
      setMaskedPhone(result.maskedPhone);
    }
    if (result.step === "OTP") setCooldown(60);
    setStep(result.step);
  }

  function reset() {
    setStep("PHONE"); setChallengeId(null); setMaskedPhone(""); setEmail(""); setOtp(""); setCooldown(0);
  }

  return (
    <div className="grid gap-4">
      {step === "PHONE" ? (
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void start(); }}>
          <label className="grid gap-2 text-sm font-medium text-zinc-800" htmlFor="quick-auth-phone">
            {labels.phone}
            <span className="flex min-h-12 overflow-hidden rounded-lg border border-zinc-300 bg-white focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-100">
              <span className="flex items-center border-r border-zinc-200 bg-zinc-50 px-3 font-semibold text-zinc-700">+373</span>
              <input aria-describedby="quick-auth-phone-hint" aria-label={labels.phone} autoComplete="tel" autoFocus className="min-w-0 flex-1 px-3 text-base tracking-wide outline-none" id="quick-auth-phone" inputMode="tel" maxLength={16} name="phone" onChange={(event) => setPhone(event.target.value)} placeholder="__ ___ ___" required type="tel" value={phone} />
            </span>
            <span className="text-xs font-normal text-zinc-500" id="quick-auth-phone-hint">{labels.phoneHint}</span>
          </label>
          <ErrorMessage message={error} />
          <button className={primaryButton} disabled={pending || localDigits.length !== 8} type="submit">{pending ? labels.sending : labels.continue}</button>
        </form>
      ) : null}

      {step === "OTP" ? (
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void verify(); }}>
          <div aria-live="polite"><h2 className="text-lg font-semibold text-zinc-950">{labels.otpTitle}</h2><p className="mt-1 text-sm text-zinc-600">{labels.otpBody} <span className="font-medium text-zinc-900">{maskedPhone}</span></p></div>
          <label className="grid gap-2 text-sm font-medium text-zinc-800" htmlFor="quick-auth-otp">
            {labels.code}
            <input aria-label={labels.code} autoComplete="one-time-code" autoFocus className="min-h-14 rounded-lg border border-zinc-300 px-4 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="quick-auth-otp" inputMode="numeric" maxLength={6} name="otp" onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required type="text" value={otp} />
          </label>
          <ErrorMessage message={error} />
          <button className={primaryButton} disabled={pending || otp.length !== 6} type="submit">{pending ? labels.verifying : labels.verify}</button>
          <div className="grid gap-1 text-center text-sm">
            <button className={textButton} disabled={pending || cooldown > 0} onClick={() => void resend()} type="button">{cooldown > 0 ? labels.wait(cooldown) : labels.resend}</button>
            <button className={textButton} disabled={pending} onClick={reset} type="button">{labels.edit}</button>
          </div>
        </form>
      ) : null}

      {step === "EMAIL" ? (
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void submitEmail(); }}>
          <div aria-live="polite"><h2 className="text-lg font-semibold text-zinc-950">{labels.emailTitle}</h2><p className="mt-1 text-sm text-zinc-600">{labels.emailBody} <span className="font-medium text-zinc-900">{maskedPhone}</span></p></div>
          <label className="grid gap-2 text-sm font-medium text-zinc-800" htmlFor="quick-auth-email">
            {labels.email}
            <input aria-label={labels.email} autoComplete="email" autoFocus className="min-h-11 rounded-lg border border-zinc-300 px-3 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="quick-auth-email" maxLength={254} name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <ErrorMessage message={error} />
          <button className={primaryButton} disabled={pending || !email.trim()} type="submit">{pending ? labels.sending : labels.continue}</button>
          <button className={textButton} disabled={pending} onClick={reset} type="button">{labels.edit}</button>
        </form>
      ) : null}

      {step === "NOT_REGISTERED" ? <StatusPanel body={labels.notRegisteredBody} title={labels.notRegisteredTitle}><Link className={primaryLink} href={`/catalog?lang=${locale}`}>{labels.catalog}</Link></StatusPanel> : null}
      {step === "BLOCKED" ? <StatusPanel body={labels.blockedBody} title={labels.blockedTitle} /> : null}
      <Link className="flex min-h-11 items-center justify-center text-center text-sm font-semibold text-emerald-700 hover:text-emerald-900" href={`/auth/sign-in?lang=${locale}`}>{labels.classic}</Link>
    </div>
  );
}

const primaryButton = "min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400";
const primaryLink = "flex min-h-11 items-center justify-center rounded-lg bg-zinc-950 px-4 text-center text-sm font-semibold text-white hover:bg-zinc-800";
const textButton = "min-h-11 font-medium text-emerald-700 hover:text-emerald-900 disabled:text-zinc-400";

function ErrorMessage({ message }: { message: string | null }) {
  return message ? <p aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{message}</p> : null;
}

function StatusPanel({ body, children, title }: { body: string; children?: ReactNode; title: string }) {
  return <section aria-live="polite" className="grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div><h2 className="text-lg font-semibold text-zinc-950">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p></div>{children}</section>;
}

function errorMessage(error: Extract<QuickAuthPublicState, { ok: false }>["error"], labels: typeof copy.ru | typeof copy.ro) {
  if (error === "INVALID_PHONE") return labels.invalidPhone;
  if (error === "INVALID_EMAIL") return labels.invalidEmail;
  if (error === "IDENTITY_MISMATCH") return labels.identityMismatch;
  if (error === "INVALID_CODE") return labels.invalidCode;
  if (error === "EXPIRED") return labels.expired;
  if (error === "RATE_LIMITED") return labels.rateLimited;
  return labels.unavailable;
}

function toLocalDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("373")) return digits.slice(3);
  if (digits.length === 9 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}
