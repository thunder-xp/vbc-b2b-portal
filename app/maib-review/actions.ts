"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createMaibReviewSession,
  isMaibReviewAccessCodeValid,
  MAIB_REVIEW_COOKIE,
  MAIB_REVIEW_COOKIE_EXPIRES_AT,
} from "@/src/modules/public-retail/maib-review-session";
import { maibReviewConfigurationSummary } from "@/src/modules/payments/server";

export async function authorizeMaibReviewAction(formData: FormData) {
  const locale = formData.get("locale") === "ro" ? "ro" : "ru";
  const configuration = maibReviewConfigurationSummary();
  if (!configuration.ready || !configuration.sandbox || configuration.production
    || configuration.apiOrigin !== "https://sandbox.maibmerchants.md") {
    redirect(`/maib-review?lang=${locale}&error=unavailable`);
  }
  if (!isMaibReviewAccessCodeValid(String(formData.get("accessCode") ?? ""))) {
    redirect(`/maib-review?lang=${locale}&error=invalid`);
  }
  (await cookies()).set(MAIB_REVIEW_COOKIE, createMaibReviewSession(), {
    expires: MAIB_REVIEW_COOKIE_EXPIRES_AT,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  redirect(`/catalog?lang=${locale}`);
}
