"use server";

import { cookies } from "next/headers";

import { isPartnerLocale, PARTNER_LOCALE_COOKIE, type PartnerLocale } from "./locale";

export async function setPartnerLocaleAction(locale: PartnerLocale): Promise<void> {
  if (!isPartnerLocale(locale)) throw new Error("INVALID_PARTNER_LOCALE");
  (await cookies()).set(PARTNER_LOCALE_COOKIE, locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
