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
  const params = new URLSearchParams(window.location.search);
  const nextPath = safeNextPath(params.get("next"));
  const intent = params.get("intent") === "agent" ? "agent" : "installer";
  const roleCopy = intent === "agent"
    ? {
        title: locale === "ru" ? "Регистрация коммерческого агента" : "Înregistrare agent comercial",
        description: locale === "ru"
          ? "Создайте бизнес-аккаунт, чтобы заполнить и отслеживать заявку коммерческого агента."
          : "Creați un cont business pentru a completa și urmări cererea de agent comercial.",
      }
    : {
        title: locale === "ru" ? "Регистрация профессионального инсталлятора" : "Înregistrare instalator profesionist",
        description: locale === "ru"
          ? "Создайте бизнес-аккаунт. После входа вы сможете отправить данные на проверку Novotech."
          : "Creați un cont business. După autentificare veți putea trimite datele spre verificare Novotech.",
      };

  return (
    <AuthPageShell
      backHref={`/become-partner?lang=${locale}`}
      backLabel={locale === "ru" ? "Назад к выбору" : "Înapoi la alegere"}
      description={roleCopy.description}
      eyebrow={copy.eyebrow}
      homeHref={`/?lang=${locale}`}
      maxWidth="lg"
      title={roleCopy.title}
    >
      <RegisterForm intent={intent} locale={locale} nextPath={nextPath} />
    </AuthPageShell>
  );
}

function safeNextPath(value: string | null): string | undefined {
  return value?.startsWith("/") && !value.startsWith("//") && value.length <= 500
    ? value
    : undefined;
}
