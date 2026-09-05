"use client";

import { useTransition } from "react";

import { setPartnerLocaleAction } from "./actions";
import { partnerText } from "./copy";
import type { PartnerLocale } from "./locale";

export function PartnerLanguageSwitch({ locale }: { locale: PartnerLocale }) {
  const [pending, startTransition] = useTransition();
  const nextLocale = locale === "ru" ? "ro" : "ru";
  const label = locale === "ru" ? "RO" : "RU";
  const accessibleLabel = partnerText(
    locale,
    locale === "ru" ? "shell.switchToRomanian" : "shell.switchToRussian",
  );

  return (
    <button
      aria-label={accessibleLabel}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      data-header-control="language"
      onClick={() => {
        const event = new CustomEvent("novotech:before-locale-change", {
          cancelable: true,
        });
        if (!window.dispatchEvent(event)) return;
        startTransition(() => setPartnerLocaleAction(nextLocale));
      }}
      title={accessibleLabel}
      type="button"
    >
      {label}
    </button>
  );
}
