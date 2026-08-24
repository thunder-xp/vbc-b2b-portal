"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { PublicRetailLocale } from "../types";

export function PublicLocaleSwitch({ locale }: { locale: PublicRetailLocale }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nextLocale = locale === "ru" ? "ro" : "ru";
  const params = new URLSearchParams(searchParams?.toString() ?? "");
  params.set("lang", nextLocale);
  return <Link aria-label={locale === "ru" ? "Переключить на румынский" : "Comută în limba rusă"} className="grid size-11 shrink-0 place-items-center rounded-sm text-xs font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" href={`${pathname || "/"}?${params.toString()}`} prefetch={false}>{nextLocale.toUpperCase()}</Link>;
}
