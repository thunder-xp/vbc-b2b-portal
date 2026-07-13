"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { PublicLocale } from "@/src/modules/public-locale";

import { registerAction } from "../actions/auth.actions";
import { authCopy, localizeRegistrationError } from "../auth-copy";

export function RegisterForm({ locale }: { locale: PublicLocale }) {
  const [state, formAction, isPending] = useActionState(registerAction, {
    error: null,
  });
  const copy = authCopy[locale].registration;
  const errorMessage = localizeRegistrationError(locale, state.error);

  return (
    <form action={formAction} className="grid gap-5">
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        {copy.company}
        <input className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" name="company" required />
      </label>
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        {copy.country}
        <input className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" name="country" required />
      </label>
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        {copy.email}
        <input autoComplete="email" className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" name="email" required type="email" />
      </label>
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        {copy.password}
        <input autoComplete="new-password" className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" name="password" required type="password" />
      </label>
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        {copy.confirmPassword}
        <input autoComplete="new-password" className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" name="confirmPassword" required type="password" />
      </label>
      {errorMessage ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
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
      <Link className="text-center text-sm font-medium text-emerald-700" href="/auth/sign-in">
        {copy.alreadyRegistered}
      </Link>
    </form>
  );
}
