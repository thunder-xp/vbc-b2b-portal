"use client";

import Link from "next/link";

import { usePublicLocale } from "@/src/modules/public-locale";

import { accessContextCopy } from "../access-context/copy";
import { AuthLocaleSwitch } from "./AuthLocaleSwitch";
import { AuthPageLoading, AuthPageShell } from "./AuthPageShell";
import { SignInForm } from "./SignInForm";

export function UnifiedAuthCenter() {
  const { locale, isLocaleReady } = usePublicLocale();
  if (!isLocaleReady) return <AuthPageLoading />;
  const copy = accessContextCopy[locale];

  return (
    <AuthPageShell description={copy.authDescription} eyebrow={copy.brand} title={copy.authTitle}>
      <AuthLocaleSwitch locale={locale} />
      <div className="mt-4 rounded-lg border border-zinc-200 p-4">
        <h2 className="text-base font-semibold text-zinc-950">{copy.businessLabel}</h2>
        <p className="mb-4 mt-1 text-sm text-zinc-500">{copy.businessHint}</p>
        <SignInForm locale={locale} />
      </div>
      <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        {copy.divider}
        <span className="h-px flex-1 bg-zinc-200" />
      </div>
      <Link className="flex min-h-11 w-full items-center justify-center rounded-md border border-emerald-700 px-4 text-center text-sm font-semibold text-emerald-800 hover:bg-emerald-50" href="/auth/customer">
        {copy.customerAction}
      </Link>
      <p className="mt-2 text-center text-xs text-zinc-500">{copy.customerHint}</p>
    </AuthPageShell>
  );
}
