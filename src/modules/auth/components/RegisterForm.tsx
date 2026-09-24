"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { PublicLocale } from "@/src/modules/public-locale";

import {
  registerAgentAction,
  registerInstallerAction,
  resendProfessionalConfirmationAction,
} from "../actions/auth.actions";
import { authCopy, localizeRegistrationError } from "../auth-copy";

export function RegisterForm({
  intent,
  locale,
}: {
  intent: "agent" | "installer";
  locale: PublicLocale;
}) {
  const registrationAction = intent === "agent" ? registerAgentAction : registerInstallerAction;
  const [state, formAction, isPending] = useActionState(registrationAction, {
    error: null,
  });
  const [resendState, resendAction, isResending] = useActionState(resendProfessionalConfirmationAction, {
    error: null,
  });
  const copy = authCopy[locale].registration;
  const errorMessage = localizeRegistrationError(locale, state.error);
  const resendErrorMessage = localizeRegistrationError(locale, resendState.error);
  const confirmationEmail = resendState.email ?? state.email;
  const confirmationStatus = resendState.status ?? state.status;
  const nextPath = intent === "agent"
    ? `/become-partner/agent?lang=${locale}`
    : `/onboarding/profile?lang=${locale}`;

  return (
    <div className="grid gap-4">
    <form action={formAction} className="grid gap-4">
      <input name="locale" type="hidden" value={locale} />
      <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
        <span>{locale === "ru" ? "Форма работы" : copy.legalForm} <span className="text-xs font-normal text-zinc-500">({copy.required})</span></span>
        <select className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" defaultValue="INDIVIDUAL" name="legalForm" required>
          <option value="INDIVIDUAL">{copy.individual}</option>
          <option value="LEGAL_ENTITY">{copy.legalEntity}</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        <span>{copy.email} <span className="text-xs font-normal text-zinc-500">({copy.required})</span></span>
        <input autoComplete="email" className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" name="email" required type="email" />
      </label>
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        <span>{copy.password} <span className="text-xs font-normal text-zinc-500">({copy.required})</span></span>
        <input autoComplete="new-password" className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" name="password" required type="password" />
      </label>
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        <span>{copy.confirmPassword} <span className="text-xs font-normal text-zinc-500">({copy.required})</span></span>
        <input autoComplete="new-password" className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" name="confirmPassword" required type="password" />
      </label>
      {errorMessage ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button
        className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-400"
        disabled={isPending}
        type="submit"
      >
        {isPending ? copy.loading : copy.submit}
      </button>
      <Link className="flex min-h-11 items-center justify-center text-center text-sm font-medium text-emerald-700" href={signInHref(locale, nextPath)}>
        {copy.alreadyRegistered}
      </Link>
    </form>
    {confirmationStatus && confirmationEmail ? (
      <form action={resendAction} className="grid gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
        <input name="email" type="hidden" value={confirmationEmail} />
        <input name="intent" type="hidden" value={intent} />
        <input name="locale" type="hidden" value={locale} />
        <p className="text-sm text-emerald-900" role="status">
          {confirmationStatus === "CONFIRMATION_SENT" ? copy.confirmationSent : copy.confirmationPending}
        </p>
        {resendErrorMessage ? <p className="text-sm text-red-800" role="alert">{resendErrorMessage}</p> : null}
        {confirmationStatus === "CONFIRMATION_PENDING" ? (
          <button
            className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-800 disabled:opacity-60"
            disabled={isResending}
            type="submit"
          >
            {isResending ? copy.resending : copy.resendConfirmation}
          </button>
        ) : null}
      </form>
    ) : null}
    </div>
  );
}

function signInHref(locale: PublicLocale, nextPath?: string) {
  const query = new URLSearchParams({ lang: locale });
  if (nextPath) query.set("next", nextPath);
  return `/auth/sign-in?${query.toString()}`;
}
