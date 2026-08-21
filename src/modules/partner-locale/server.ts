import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { DEFAULT_PARTNER_LOCALE, isPartnerLocale, PARTNER_LOCALE_COOKIE, type PartnerLocale } from "./locale";

export const getPartnerLocale = cache(async (): Promise<PartnerLocale> => {
  const value = (await cookies()).get(PARTNER_LOCALE_COOKIE)?.value;
  return isPartnerLocale(value) ? value : DEFAULT_PARTNER_LOCALE;
});
