export const PARTNER_LOCALES = ["ru", "ro"] as const;

export type PartnerLocale = (typeof PARTNER_LOCALES)[number];

export const DEFAULT_PARTNER_LOCALE: PartnerLocale = "ru";
export const PARTNER_LOCALE_COOKIE = "novotech-partner-locale";

export function isPartnerLocale(value: unknown): value is PartnerLocale {
  return value === "ru" || value === "ro";
}

export function partnerLocaleTag(locale: PartnerLocale): "ru-RU" | "ro-RO" {
  return locale === "ro" ? "ro-RO" : "ru-RU";
}
