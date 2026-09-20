import Link from "next/link";

import type { PublicLocale } from "@/src/modules/public-locale";

export function BusinessPhoneEnrollmentLink({ locale, returnTo }: { locale: PublicLocale; returnTo: string }) {
  const ro = locale === "ro";
  const query = new URLSearchParams({ lang: locale, next: returnTo });
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-zinc-950">{ro ? "Autentificare rapidă prin telefon" : "Быстрый вход по телефону"}</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-600">{ro ? "Confirmați sau schimbați numărul folosit pentru autentificarea prin SMS." : "Подтвердите или измените номер, который используется для входа по SMS."}</p>
      <Link className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50" href={`/auth/business-phone-enrollment?${query.toString()}`}>{ro ? "Gestionați numărul" : "Управлять номером"}</Link>
    </section>
  );
}
