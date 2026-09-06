"use server";

import { createUserProfileService, getAuthenticatedUserId } from "../access-control/actions/service-factory";
import { isPartnerLocale, type PartnerLocale } from "./locale";
import { setPartnerLocaleCookie } from "./server";

export async function setPartnerLocaleAction(locale: PartnerLocale): Promise<void> {
  if (!isPartnerLocale(locale)) throw new Error("INVALID_PARTNER_LOCALE");
  const userId = await getAuthenticatedUserId();
  await createUserProfileService().updateOwnProfile(userId, { preferredLocale: locale });
  await setPartnerLocaleCookie(locale);
}
