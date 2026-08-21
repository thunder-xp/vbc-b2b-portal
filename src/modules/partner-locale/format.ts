import { partnerLocaleTag, type PartnerLocale } from "./locale";

export function formatPartnerDate(value: string | Date, locale: PartnerLocale, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Intl.DateTimeFormat(partnerLocaleTag(locale), options).format(typeof value === "string" ? new Date(value) : value);
}

export function formatPartnerDateTime(value: string | Date, locale: PartnerLocale): string {
  return formatPartnerDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatPartnerNumber(value: number, locale: PartnerLocale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(partnerLocaleTag(locale), options).format(value);
}

export function formatPartnerMoney(value: number, currency: string, locale: PartnerLocale): string {
  try {
    return new Intl.NumberFormat(partnerLocaleTag(locale), { currency, maximumFractionDigits: 2, style: "currency" }).format(value);
  } catch {
    return `${formatPartnerNumber(value, locale, { maximumFractionDigits: 2 })} ${currency}`;
  }
}
