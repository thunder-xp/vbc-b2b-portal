"use client";

import {
  AuthPageLoading,
  AuthPageShell,
  BusinessSignInExperience,
} from "@/src/modules/auth/components";
import { authCopy } from "@/src/modules/auth/auth-copy";
import { usePublicLocale } from "@/src/modules/public-locale";

export default function SignInPage() {
  const { locale, isLocaleReady } = usePublicLocale();

  if (!isLocaleReady) return <AuthPageLoading />;

  const copy = authCopy[locale].signIn;
  const query = new URLSearchParams(window.location.search);
  const registrationSucceeded = query.get("registered") === "1";
  const confirmationSucceeded = query.get("confirmed") === "1";
  const nextPath = safeNextPath(query.get("next"));

  return (
    <AuthPageShell description={copy.description} eyebrow={copy.eyebrow} homeHref={`/?lang=${locale}`} title={copy.title}>
      {registrationSucceeded || confirmationSucceeded ? (
        <p className="mb-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {confirmationSucceeded ? copy.confirmationSuccess : copy.registrationSuccess}
        </p>
      ) : null}
      <BusinessSignInExperience locale={locale} nextPath={nextPath} />
    </AuthPageShell>
  );
}

function safeNextPath(value: string | null): string | undefined {
  return value?.startsWith("/") && !value.startsWith("//") && value.length <= 500
    ? value
    : undefined;
}
