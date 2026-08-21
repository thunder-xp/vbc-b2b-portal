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

export function formatPartnerRelativeAge(value: string | Date, locale: PartnerLocale, now = Date.now()): string {
  const timestamp = typeof value === "string" ? Date.parse(value) : value.getTime();
  const ageMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  const formatter = new Intl.RelativeTimeFormat(partnerLocaleTag(locale), { numeric: "always" });

  if (ageMinutes < 60) return formatter.format(-ageMinutes, "minute");
  return formatter.format(-Math.floor(ageMinutes / 60), "hour");
}

export function formatPartnerRelativeDate(value: string | Date, locale: PartnerLocale, now = Date.now()): string {
  const timestamp = typeof value === "string"
    ? Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
    : Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  if (!Number.isFinite(timestamp)) return "";
  const current = new Date(now);
  const today = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  const days = Math.round((timestamp - today) / 86_400_000);
  if (days === 0) return locale === "ro" ? "astăzi" : "сегодня";
  return new Intl.RelativeTimeFormat(partnerLocaleTag(locale), { numeric: "auto" }).format(days, "day");
}
