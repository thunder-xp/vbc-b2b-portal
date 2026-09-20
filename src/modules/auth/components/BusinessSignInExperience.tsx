"use client";

import Link from "next/link";

import type { PublicLocale } from "@/src/modules/public-locale";

import { accessContextCopy } from "../access-context/copy";
import { SignInForm } from "./SignInForm";

export function BusinessSignInExperience({
  locale,
  nextPath,
}: {
  locale: PublicLocale;
  nextPath?: string;
}) {
  const copy = accessContextCopy[locale];

  return (
    <>
      <SignInForm locale={locale} nextPath={nextPath} />
      <div className="my-4 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        {copy.divider}
        <span className="h-px flex-1 bg-zinc-200" />
      </div>
      <Link
        className="flex min-h-11 w-full items-center justify-center rounded-md border border-emerald-700 px-4 text-center text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
        href={`/auth/customer?lang=${locale}`}
      >
        {copy.customerAction}
      </Link>
    </>
  );
}
