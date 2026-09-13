"use client";

import Link from "next/link";

import { PhoneOtpForm } from "@/src/modules/final-customer-auth/components";
import { usePublicLocale } from "@/src/modules/public-locale";

export default function FinalCustomerSignInPage() {
  const { locale, isLocaleReady } = usePublicLocale();
  if (!isLocaleReady) return <main className="min-h-screen bg-zinc-50" />;
  const ru = locale === "ru";
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 py-8">
      <section className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <Link className="text-sm font-semibold text-emerald-700" href="/">NSD</Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950">{ru ? "Личный кабинет" : "Cont personal"}</h1>
        <p className="mb-6 mt-1 text-sm text-zinc-500">{ru ? "Быстрый вход по номеру телефона" : "Autentificare rapidă cu numărul de telefon"}</p>
        <PhoneOtpForm locale={locale} />
      </section>
    </main>
  );
}
