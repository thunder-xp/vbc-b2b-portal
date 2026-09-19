"use client";

import { Building2, UserRound } from "lucide-react";

import { usePublicLocale } from "@/src/modules/public-locale";

import { switchBusinessContextAction } from "../access-context/actions";
import { accessContextCopy } from "../access-context/copy";
import type { BusinessAccessContext } from "../access-context/types";
import { AuthLocaleSwitch } from "./AuthLocaleSwitch";
import { AuthPageLoading, AuthPageShell } from "./AuthPageShell";

export function BusinessContextSelector({ contexts, unavailable }: { contexts: readonly BusinessAccessContext[]; unavailable: boolean }) {
  const { locale, isLocaleReady } = usePublicLocale();
  if (!isLocaleReady) return <AuthPageLoading />;
  const copy = accessContextCopy[locale];
  return (
    <AuthPageShell description={copy.selectDescription} eyebrow={copy.brand} maxWidth="lg" title={copy.selectTitle}>
      <AuthLocaleSwitch locale={locale} />
      {unavailable ? <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{copy.unavailable}</p> : null}
      <div className="mt-4 grid gap-3">
        {contexts.map((context) => {
          const Icon = context.type === "PARTNER" ? Building2 : UserRound;
          return (
            <form action={switchBusinessContextAction} className="flex min-w-0 items-center gap-3 rounded-lg border border-zinc-200 p-3" key={`${context.type}:${context.contextId}`}>
              <Icon aria-hidden className="size-5 shrink-0 text-emerald-700" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-950">{context.displayName}</p>
                <p className="text-xs text-zinc-500">{context.type === "PARTNER" ? copy.partner : copy.agent}</p>
              </div>
              <input name="contextType" type="hidden" value={context.type} />
              <input name="contextId" type="hidden" value={context.contextId} />
              <button className="min-h-11 shrink-0 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800" type="submit">{copy.open}</button>
            </form>
          );
        })}
      </div>
    </AuthPageShell>
  );
}
