"use client";

import { usePublicLocale } from "@/src/modules/public-locale";
import { QuickAuthCard } from "@/src/modules/quick-auth/components/QuickAuthCard";

import { accessContextCopy } from "../access-context/copy";
import { AuthPageLoading, AuthPageShell } from "./AuthPageShell";

export function CustomerAuthEntry() {
  const { locale, isLocaleReady } = usePublicLocale();
  if (!isLocaleReady) return <AuthPageLoading />;
  const copy = accessContextCopy[locale];
  return (
    <AuthPageShell description={copy.customerDescription} eyebrow={copy.brand} homeHref={`/?lang=${locale}`} title={copy.customerTitle}>
      <QuickAuthCard locale={locale} />
    </AuthPageShell>
  );
}
