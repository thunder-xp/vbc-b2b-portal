"use client";

import { Languages } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setPartnerLocaleAction } from "./actions";
import { partnerText } from "./copy";
import type { PartnerLocale } from "./locale";

export function PartnerLanguageSwitch({ locale, variant = "header" }: { locale: PartnerLocale; variant?: "header" | "menu" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextLocale = locale === "ru" ? "ro" : "ru";
  const label = locale === "ru" ? "RO" : "RU";
  const currentLanguage = partnerText(
    locale,
    locale === "ru" ? "shell.russian" : "shell.romanian",
  );
  const nextLanguage = partnerText(
    locale,
    locale === "ru" ? "shell.romanian" : "shell.russian",
  );
  const accessibleLabel = partnerText(
    locale,
    locale === "ru" ? "shell.switchToRomanian" : "shell.switchToRussian",
  );

  return (
    <button
      aria-label={accessibleLabel}
      className={variant === "menu"
        ? "flex min-h-11 w-full items-center gap-3 rounded px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-wait disabled:opacity-60"
        : "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-wait disabled:opacity-60"}
      disabled={pending}
      data-header-control={variant === "header" ? "language" : undefined}
      onClick={() => {
        const event = new CustomEvent("novotech:before-locale-change", {
          cancelable: true,
        });
        if (!window.dispatchEvent(event)) return;
        startTransition(async () => {
          await setPartnerLocaleAction(nextLocale);
          router.refresh();
        });
      }}
      title={accessibleLabel}
      type="button"
      role={variant === "menu" ? "menuitem" : undefined}
    >
      {variant === "menu" ? <><Languages aria-hidden="true" className="size-4" /><span className="flex flex-1 flex-col text-left leading-tight"><span>{partnerText(locale, "shell.language")}</span><span className="text-xs font-normal text-zinc-500">{currentLanguage}</span></span><span className="text-xs font-semibold">{nextLanguage}</span></> : label}
    </button>
  );
}
