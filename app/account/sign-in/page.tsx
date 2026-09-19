import Link from "next/link";
import { redirect } from "next/navigation";

import { isUnifiedAuthCenterEnabled } from "@/src/modules/auth/access-context";
import { PhoneOtpForm } from "@/src/modules/final-customer-auth/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";

export default async function FinalCustomerSignInPage() {
  if (isUnifiedAuthCenterEnabled()) redirect("/auth/customer");
  const locale = await getFinalCustomerLocale();
  const ru = locale === "ru";
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 py-8">
      <section className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <Link className="text-sm font-semibold text-emerald-700" href={`/?lang=${locale}`}>NSD</Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950">{ru ? "Личный кабинет" : "Cont personal"}</h1>
        <p className="mb-6 mt-1 text-sm text-zinc-500">{ru ? "Быстрый вход по номеру телефона" : "Autentificare rapidă cu numărul de telefon"}</p>
        <PhoneOtpForm locale={locale} />
      </section>
    </main>
  );
}
