"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { PublicLocale } from "@/src/modules/public-locale";

import { requestPhoneOtp, verifyPhoneOtp } from "../phone-otp.client";

const copy = {
  ru: {
    phone: "Телефон",
    phoneHint: "8 цифр после +373",
    send: "Получить код",
    sending: "Отправляем…",
    title: "Введите код из SMS",
    code: "Код подтверждения",
    verify: "Подтвердить",
    verifying: "Проверяем…",
    resend: "Отправить код повторно",
    wait: (seconds: number) => `Повторная отправка через ${seconds} сек.`,
    edit: "Изменить номер",
    sendError: "Не удалось отправить код. Попробуйте ещё раз.",
    verifyError: "Код не подошёл или истёк. Проверьте код и попробуйте снова.",
  },
  ro: {
    phone: "Telefon",
    phoneHint: "8 cifre după +373",
    send: "Primește codul",
    sending: "Se trimite…",
    title: "Introduceți codul din SMS",
    code: "Cod de confirmare",
    verify: "Confirmă",
    verifying: "Se verifică…",
    resend: "Trimite codul din nou",
    wait: (seconds: number) => `Retrimitere peste ${seconds} sec.`,
    edit: "Schimbă numărul",
    sendError: "Codul nu a putut fi trimis. Încercați din nou.",
    verifyError: "Codul este incorect sau a expirat. Verificați-l și încercați din nou.",
  },
} as const;

export function PhoneOtpForm({
  locale,
  successPath = "/account",
}: {
  locale: PublicLocale;
  successPath?: "/account" | "/auth/customer/complete";
}) {
  const router = useRouter();
  const labels = copy[locale];
  const [step, setStep] = useState<"PHONE" | "OTP">("PHONE");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const localDigits = useMemo(() => phone.replace(/\D/g, "").slice(0, 8), [phone]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendCode() {
    setPending(true);
    setError(null);
    try {
      await requestPhoneOtp(localDigits);
      setStep("OTP");
      setCooldown(60);
    } catch {
      setError(labels.sendError);
    } finally {
      setPending(false);
    }
  }

  async function verifyCode() {
    setPending(true);
    setError(null);
    try {
      await verifyPhoneOtp(localDigits, otp.replace(/\D/g, ""));
      router.replace(successPath);
      router.refresh();
    } catch {
      setError(labels.verifyError);
    } finally {
      setPending(false);
    }
  }

  if (step === "PHONE") {
    return (
      <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); void sendCode(); }}>
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          {labels.phone}
          <span className="flex h-12 overflow-hidden rounded-lg border border-zinc-300 bg-white focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-100">
            <span className="flex items-center border-r border-zinc-200 bg-zinc-50 px-3 font-semibold text-zinc-700">+373</span>
            <input
              aria-label={labels.phone}
              aria-describedby="customer-phone-hint"
              autoComplete="tel-national"
              autoFocus
              className="min-w-0 flex-1 px-3 text-base tracking-wide outline-none"
              inputMode="numeric"
              maxLength={11}
              name="phone"
              onChange={(event) => setPhone(event.target.value)}
              pattern="[0-9 ]{8,11}"
              placeholder="__ ___ ___"
              required
              type="tel"
              value={phone}
            />
          </span>
          <span className="text-xs font-normal text-zinc-500" id="customer-phone-hint">{labels.phoneHint}</span>
        </label>
        {error ? <p aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <button className="min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400" disabled={pending || localDigits.length !== 8} type="submit">
          {pending ? labels.sending : labels.send}
        </button>
      </form>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); void verifyCode(); }}>
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">{labels.title}</h2>
        <p className="mt-1 text-sm text-zinc-500">+373 {formatLocalPhone(localDigits)}</p>
      </div>
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        {labels.code}
        <input
          aria-label={labels.code}
          autoComplete="one-time-code"
          autoFocus
          className="h-14 rounded-lg border border-zinc-300 px-4 text-center font-mono text-2xl tracking-[0.45em] outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          inputMode="numeric"
          maxLength={6}
          name="otp"
          onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
          pattern="[0-9]{6}"
          required
          type="text"
          value={otp}
        />
      </label>
      {error ? <p aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button className="min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400" disabled={pending || otp.length !== 6} type="submit">
        {pending ? labels.verifying : labels.verify}
      </button>
      <div className="grid gap-2 text-center text-sm">
        <button className="min-h-11 font-medium text-emerald-700 disabled:text-zinc-400" disabled={pending || cooldown > 0} onClick={() => void sendCode()} type="button">
          {cooldown > 0 ? labels.wait(cooldown) : labels.resend}
        </button>
        <button className="min-h-11 text-zinc-600" disabled={pending} onClick={() => { setStep("PHONE"); setOtp(""); setError(null); }} type="button">{labels.edit}</button>
      </div>
    </form>
  );
}

function formatLocalPhone(value: string) {
  return `${value.slice(0, 2)} ${value.slice(2, 5)} ${value.slice(5, 8)}`.trim();
}
