export type PublicLocale = "ru" | "ro";

export const DEFAULT_PUBLIC_LOCALE: PublicLocale = "ru";
export const PUBLIC_LOCALE_STORAGE_KEY = "novotech-landing-locale";

export function isPublicLocale(value: string | null): value is PublicLocale {
  return value === "ru" || value === "ro";
}

export function readPublicLocale(storage: Pick<Storage, "getItem">): PublicLocale {
  const storedLocale = storage.getItem(PUBLIC_LOCALE_STORAGE_KEY);
  return isPublicLocale(storedLocale) ? storedLocale : DEFAULT_PUBLIC_LOCALE;
}
