"use client";

import type { PublicLocale } from "@/src/modules/public-locale";
import { usePublicLocale } from "@/src/modules/public-locale";

export function AuthLocaleSwitch({ locale }: { locale: PublicLocale }) {
  const { setLocale } = usePublicLocale();
  return (
    <div aria-label="Language" className="flex justify-end gap-1" role="group">
      {(["ru", "ro"] as const).map((value) => (
        <button
          aria-pressed={locale === value}
          className={`min-h-11 min-w-11 rounded-md px-3 text-xs font-semibold ${locale === value ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          key={value}
          onClick={() => setLocale(value)}
          type="button"
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
