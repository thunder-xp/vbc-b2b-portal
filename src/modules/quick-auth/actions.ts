"use server";

import { headers } from "next/headers";

import {
  createBusinessAccessResolver,
  decideBusinessRoute,
  getCurrentAuthUserId,
  resolveCustomerAccessForUser,
} from "@/src/modules/auth/access-context";

import { createQuickAuthResolver, quickAuthRequesterHash } from "./factory";
import type { QuickAuthPublicState, QuickAuthVerifyState } from "./types";

export async function startQuickAuthAction(rawPhone: string): Promise<QuickAuthPublicState> {
  return createQuickAuthResolver().start(rawPhone, await requesterHash());
}

export async function submitBusinessQuickAuthEmailAction(challengeId: string, rawPhone: string, rawEmail: string): Promise<QuickAuthPublicState> {
  return createQuickAuthResolver().submitBusinessEmail(challengeId, rawPhone, rawEmail);
}

export async function resendQuickAuthOtpAction(challengeId: string, rawPhone: string): Promise<QuickAuthPublicState> {
  return createQuickAuthResolver().resend(challengeId, rawPhone);
}

export async function verifyQuickAuthOtpAction(challengeId: string, rawPhone: string, token: string, locale: "ru" | "ro"): Promise<QuickAuthVerifyState> {
  const result = await createQuickAuthResolver().verify(challengeId, rawPhone, token.replace(/\D/g, ""));
  if (!result.ok || result.step !== "OTP") return result;
  return { ok: true, step: "AUTHENTICATED", redirectTo: await resolvePostQuickAuthRoute(locale) };
}

async function resolvePostQuickAuthRoute(locale: "ru" | "ro") {
  const userId = await getCurrentAuthUserId();
  const [customer, business] = await Promise.all([
    resolveCustomerAccessForUser(userId),
    createBusinessAccessResolver().resolve(userId),
  ]);
  const customerAvailable = customer.status === "AVAILABLE";
  const businessAvailable = business.contexts.some((context) => context.status === "AVAILABLE");

  if (customerAvailable && businessAvailable) return `/auth/select-access?lang=${locale}`;
  if (customerAvailable) return "/account";
  if (businessAvailable) return decideBusinessRoute(business).targetRoute;
  if (business.contexts.length > 0) return "/auth/business-access-state";
  return customer.status === "BLOCKED" ? "/auth/customer-access-state" : "/auth/customer-not-active";
}

async function requesterHash() {
  const requestHeaders = await headers();
  const address = requestHeaders.get("cf-connecting-ip")
    ?? requestHeaders.get("x-real-ip")
    ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  return quickAuthRequesterHash(address);
}
