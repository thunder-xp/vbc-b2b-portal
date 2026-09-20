"use client";

import { usePublicLocale } from "@/src/modules/public-locale";

import { accessContextCopy } from "../access-context/copy";
import { BusinessSignInExperience } from "./BusinessSignInExperience";
import { AuthPageLoading, AuthPageShell } from "./AuthPageShell";

export function UnifiedAuthCenter() {
  const { locale, isLocaleReady } = usePublicLocale();
  if (!isLocaleReady) return <AuthPageLoading />;
  const copy = accessContextCopy[locale];

  return (
    <AuthPageShell description={copy.authDescription} eyebrow={copy.brand} homeHref={`/?lang=${locale}`} title={copy.authTitle}>
      <BusinessSignInExperience locale={locale} />
    </AuthPageShell>
  );
}
