"use client";

import {
  AuthPageLoading,
  AuthPageShell,
  RegisterForm,
} from "@/src/modules/auth/components";
import { authCopy } from "@/src/modules/auth/auth-copy";
import { usePublicLocale } from "@/src/modules/public-locale";

export default function RegisterPage() {
  const { locale, isLocaleReady } = usePublicLocale();

  if (!isLocaleReady) return <AuthPageLoading />;

  const copy = authCopy[locale].registration;
  const nextPath = safeNextPath(new URLSearchParams(window.location.search).get("next"));

  return (
    <AuthPageShell
      description={copy.description}
      eyebrow={copy.eyebrow}
      maxWidth="lg"
      title={copy.title}
    >
      <RegisterForm locale={locale} nextPath={nextPath} />
    </AuthPageShell>
  );
}

function safeNextPath(value: string | null): string | undefined {
  return value?.startsWith("/") && !value.startsWith("//") && value.length <= 500
    ? value
    : undefined;
}
