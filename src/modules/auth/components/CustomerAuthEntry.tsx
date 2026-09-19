"use client";

import Link from "next/link";

import { PhoneOtpForm } from "@/src/modules/final-customer-auth/components";
import { usePublicLocale } from "@/src/modules/public-locale";

import { accessContextCopy } from "../access-context/copy";
import { AuthLocaleSwitch } from "./AuthLocaleSwitch";
import { AuthPageLoading, AuthPageShell } from "./AuthPageShell";

export function CustomerAuthEntry() {
  const { locale, isLocaleReady } = usePublicLocale();
  if (!isLocaleReady) return <AuthPageLoading />;
  const copy = accessContextCopy[locale];
  return (
    <AuthPageShell description={copy.customerDescription} eyebrow={copy.brand} title={copy.customerTitle}>
      <AuthLocaleSwitch locale={locale} />
      <div className="mt-4"><PhoneOtpForm locale={locale} successPath="/auth/customer/complete" /></div>
      <Link className="mt-5 flex min-h-11 items-center justify-center text-center text-sm font-semibold text-emerald-700" href="/auth">
        {copy.businessAction}
      </Link>
    </AuthPageShell>
  );
}
