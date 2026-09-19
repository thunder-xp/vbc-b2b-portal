"use client";

import Link from "next/link";

import { usePublicLocale } from "@/src/modules/public-locale";

import { accessContextCopy } from "../access-context/copy";
import { AuthLocaleSwitch } from "./AuthLocaleSwitch";
import { AuthPageLoading, AuthPageShell } from "./AuthPageShell";

type StateKind = "CUSTOMER_NOT_ACTIVE" | "CUSTOMER_BLOCKED" | "BUSINESS_UNAVAILABLE";

export function LocalizedAccessState({ kind }: { kind: StateKind }) {
  const { locale, isLocaleReady } = usePublicLocale();
  if (!isLocaleReady) return <AuthPageLoading />;
  const copy = accessContextCopy[locale];
  const title = kind === "CUSTOMER_NOT_ACTIVE" ? copy.notActiveTitle : kind === "CUSTOMER_BLOCKED" ? copy.customerBlockedTitle : copy.businessStateTitle;
  const body = kind === "CUSTOMER_NOT_ACTIVE" ? copy.notActiveBody : kind === "CUSTOMER_BLOCKED" ? copy.customerBlockedBody : copy.businessStateBody;
  return (
    <AuthPageShell description={body} eyebrow={copy.brand} title={title}>
      <AuthLocaleSwitch locale={locale} />
      <div className="mt-5 grid gap-3">
        {kind === "CUSTOMER_NOT_ACTIVE" ? (
          <Link className="flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" href="/catalog">{copy.catalogAction}</Link>
        ) : null}
        <Link className="flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-center text-sm font-semibold text-zinc-800" href="/auth">{copy.businessAction}</Link>
      </div>
    </AuthPageShell>
  );
}
