"use client";

import {
  AuthPageLoading,
  AuthPageShell,
  SignInForm,
} from "@/src/modules/auth/components";
import { authCopy } from "@/src/modules/auth/auth-copy";
import { usePublicLocale } from "@/src/modules/public-locale";

export default function SignInPage() {
  const { locale, isLocaleReady } = usePublicLocale();

  if (!isLocaleReady) return <AuthPageLoading />;

  const copy = authCopy[locale].signIn;
  const registrationSucceeded = new URLSearchParams(window.location.search).get("registered") === "1";

  return (
    <AuthPageShell description={copy.description} eyebrow={copy.eyebrow} title={copy.title}>
      {registrationSucceeded ? (
        <p className="mb-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {copy.registrationSuccess}
        </p>
      ) : null}
      <SignInForm locale={locale} />
    </AuthPageShell>
  );
}
