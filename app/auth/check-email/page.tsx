"use client";

import Link from "next/link";

import { AuthPageLoading, AuthPageShell } from "@/src/modules/auth/components";
import { safeRelativeAuthRedirect } from "@/src/modules/auth/redirects";
import { usePublicLocale } from "@/src/modules/public-locale";

export default function CheckEmailPage() {
  const { locale, isLocaleReady } = usePublicLocale();
  if (!isLocaleReady) return <AuthPageLoading />;

  const query = new URLSearchParams(window.location.search);
  const nextPath = safeRelativeAuthRedirect(query.get("next"));
  const signInQuery = new URLSearchParams({ lang: locale });
  if (nextPath) signInQuery.set("next", nextPath);
  const ru = locale === "ru";

  return (
    <AuthPageShell
      description={ru
        ? "Подтвердите email, чтобы продолжить регистрацию."
        : "Confirmați adresa de e-mail pentru a continua înregistrarea."}
      eyebrow="Novotech Systems Distribution"
      homeHref={`/?lang=${locale}`}
      title={ru ? "Аккаунт создан" : "Cont creat"}
    >
      <div className="grid gap-4">
        <p className="rounded-md bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-900" role="status">
          {ru
            ? "Ссылка для подтверждения отправлена на указанный email. После подтверждения войдите, чтобы продолжить."
            : "Linkul de confirmare a fost trimis la adresa indicată. După confirmare, autentificați-vă pentru a continua."}
        </p>
        <Link
          className="flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-center text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          href={`/auth/sign-in?${signInQuery.toString()}`}
        >
          {ru ? "Перейти ко входу" : "Continuă la autentificare"}
        </Link>
      </div>
    </AuthPageShell>
  );
}
