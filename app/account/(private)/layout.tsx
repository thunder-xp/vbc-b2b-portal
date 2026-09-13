import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { signOutFinalCustomerAction } from "@/src/modules/final-customer/actions";
import { CustomerNavigation } from "@/src/modules/final-customer/components";
import { finalCustomerCopy, getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { FinalCustomerAuthenticationError } from "@/src/modules/final-customer/service";

export default async function PrivateAccountLayout({ children }: { children: ReactNode }) {
  let context;
  try {
    context = await getFinalCustomerContext();
  } catch (error) {
    if (error instanceof FinalCustomerAuthenticationError) redirect("/account/sign-in");
    throw error;
  }
  const locale = await getFinalCustomerLocale();
  const copy = finalCustomerCopy[locale];
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">NSD</p>
            <p className="truncate font-semibold">{context.displayName ?? copy.cabinet}</p>
          </div>
          <form action={signOutFinalCustomerAction}>
            <button className="min-h-11 rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950" type="submit">{copy.logout}</button>
          </form>
        </div>
      </header>
      <CustomerNavigation locale={locale} />
      {context.account.status === "IDENTITY_REVIEW_REQUIRED" ? (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{copy.review}</p>
        </div>
      ) : null}
      {children}
    </div>
  );
}
