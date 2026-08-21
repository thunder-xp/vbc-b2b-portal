"use client";

import { createContext, useContext, type ReactNode } from "react";

import { partnerText, type PartnerTranslationKey } from "./copy";
import type { PartnerLocale } from "./locale";

const PartnerLocaleContext = createContext<PartnerLocale | null>(null);

export function PartnerLocaleProvider({ children, locale }: { children: ReactNode; locale: PartnerLocale }) {
  return <PartnerLocaleContext value={locale}>{children}</PartnerLocaleContext>;
}

export function usePartnerLocale(): PartnerLocale {
  return useContext(PartnerLocaleContext) ?? "ru";
}

export function usePartnerText(): (key: PartnerTranslationKey) => string {
  const locale = usePartnerLocale();
  return (key) => partnerText(locale, key);
}
