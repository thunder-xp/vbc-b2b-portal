import type { PartnerLocale } from "./locale";

export function definePartnerCopy<const Copy extends Record<string, string>>(
  ru: Copy,
  ro: { [Key in keyof Copy]: string },
) {
  return (locale: PartnerLocale): Readonly<Copy> => (locale === "ro" ? ro : ru) as Copy;
}
