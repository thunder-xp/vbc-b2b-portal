"use client";

import Link from "next/link";

import { PhoneOtpForm } from "@/src/modules/final-customer-auth/components";
import { usePublicLocale } from "@/src/modules/public-locale";

import { accessContextCopy } from "../access-context/copy";
import { AuthPageLoading, AuthPageShell } from "./AuthPageShell";

export function CustomerAuthEntry() {
  const { locale, isLocaleReady } = usePublicLocale();
  if (!isLocaleReady) return <AuthPageLoading />;
  const copy = accessContextCopy[locale];
  return (
    <AuthPageShell description={copy.customerDescription} eyebrow={copy.brand} homeHref={`/?lang=${locale}`} title={copy.customerTitle}>
      <PhoneOtpForm locale={locale} successPath="/auth/customer/complete" />
      <Link className="mt-4 flex min-h-11 items-center justify-center text-center text-sm font-semibold text-emerald-700" href={`/auth?lang=${locale}`}>
        {copy.businessAction}
      </Link>
    </AuthPageShell>
  );
}
