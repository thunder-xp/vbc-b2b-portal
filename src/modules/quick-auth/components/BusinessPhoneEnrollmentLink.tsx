import Link from "next/link";

import type { PublicLocale } from "@/src/modules/public-locale";

import type { BusinessProfilePhoneStateCode } from "../profile-phone-state";

const copy = {
  ru: {
    title: "Быстрый вход по телефону",
    VERIFIED: {
      status: "✓ Номер подтверждён",
      description: "Этот номер используется для быстрого входа по SMS.",
      action: "Номер подтверждён",
    },
    VERIFICATION_REQUIRED: {
      status: "Требуется подтверждение",
      description: "Подтвердите новый номер, чтобы использовать его для быстрого входа по SMS.",
      action: "Подтвердить номер",
    },
    CONFLICT: {
      status: "Номер связан с другой учётной записью",
      description: "Используйте другой номер или обратитесь в Novotech.",
      action: "Номер недоступен",
    },
    NOT_SET: {
      status: "Номер не указан",
      description: "Введите номер телефона и сохраните профиль.",
      action: null,
    },
  },
  ro: {
    title: "Autentificare rapidă prin telefon",
    VERIFIED: {
      status: "✓ Număr confirmat",
      description: "Acest număr este utilizat pentru autentificarea rapidă prin SMS.",
      action: "Număr confirmat",
    },
    VERIFICATION_REQUIRED: {
      status: "Este necesară confirmarea",
      description: "Confirmați noul număr pentru a-l utiliza la autentificarea rapidă prin SMS.",
      action: "Confirmați numărul",
    },
    CONFLICT: {
      status: "Numărul este asociat altui cont",
      description: "Utilizați alt număr sau contactați Novotech.",
      action: "Număr indisponibil",
    },
    NOT_SET: {
      status: "Numărul nu este indicat",
      description: "Introduceți numărul de telefon și salvați profilul.",
      action: null,
    },
  },
} as const;

export function BusinessPhoneEnrollmentLink({
  canEnroll = true,
  locale,
  returnTo,
  state,
}: {
  canEnroll?: boolean;
  locale: PublicLocale;
  returnTo: string;
  state?: BusinessProfilePhoneStateCode;
}) {
  const resolvedState = state ?? "VERIFICATION_REQUIRED";
  const labels = copy[locale];
  const stateCopy = labels[resolvedState];
  const query = new URLSearchParams({ lang: locale, next: returnTo });
  const actionClass = "mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold";

  return (
    <section aria-label={labels.title} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-sm font-semibold text-zinc-950">{stateCopy.status}</p>
      <p className="mt-1 text-sm leading-5 text-zinc-600">{stateCopy.description}</p>
      {stateCopy.action && resolvedState === "VERIFICATION_REQUIRED" && canEnroll ? (
        <Link
          className={`${actionClass} border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100`}
          href={`/auth/business-phone-enrollment?${query.toString()}`}
        >
          {stateCopy.action}
        </Link>
      ) : null}
      {stateCopy.action && (resolvedState !== "VERIFICATION_REQUIRED" || !canEnroll) ? (
        <button
          className={`${actionClass} cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500`}
          disabled
          type="button"
        >
          {stateCopy.action}
        </button>
      ) : null}
    </section>
  );
}
