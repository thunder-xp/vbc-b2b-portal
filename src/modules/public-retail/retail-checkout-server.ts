import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { SupabaseRetailCheckoutRepository } from "./repositories/supabase/retail-checkout.supabase-repository";
import { SupabaseRetailCheckoutPilotRepository } from "./repositories/supabase/retail-checkout-pilot.supabase-repository";
import { RetailCheckoutService } from "./services/retail-checkout.service";
import { MAIB_REVIEW_COOKIE, validateMaibReviewSession } from "./maib-review-session";

const service = new RetailCheckoutService(new SupabaseRetailCheckoutRepository());
const pilotRepository = new SupabaseRetailCheckoutPilotRepository();
export const RETAIL_CHECKOUT_PILOT_COOKIE = "novotech_retail_checkout_pilot";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export function getRetailCheckoutService() { return service; }
export function isRetailCheckoutEnabled(environment: Record<string, string | undefined> = process.env) { return environment.RETAIL_CHECKOUT_ENABLED === "true"; }
export function hashRetailCheckoutPilotToken(token: string) { return TOKEN.test(token) ? createHash("sha256").update(token, "utf8").digest("hex") : null; }
export type RetailCheckoutAccessSource = "public" | "pilot" | "maib_review" | "none";
export type RetailCheckoutAccess = Readonly<{ allowed: boolean; source: RetailCheckoutAccessSource }>;
export function resolveRetailCheckoutAccess(input: Readonly<{ publicEnabled: boolean; reviewSessionValid: boolean; pilotSessionValid: boolean }>): RetailCheckoutAccess {
  if (input.reviewSessionValid) return { allowed: true, source: "maib_review" };
  if (input.publicEnabled) return { allowed: true, source: "public" };
  if (input.pilotSessionValid) return { allowed: true, source: "pilot" };
  return { allowed: false, source: "none" };
}
export function canInitiateRetailPaymentForAccess(
  access: RetailCheckoutAccess,
  configuration: Readonly<{ ready: boolean; sandbox: boolean; production: boolean; apiOrigin: string | null }>,
) {
  if (!access.allowed || !configuration.ready) return false;
  if (access.source !== "maib_review") return true;
  return configuration.sandbox && !configuration.production && configuration.apiOrigin === "https://sandbox.maibmerchants.md";
}
export async function getRetailCheckoutAccess(environment: Record<string, string | undefined> = process.env): Promise<RetailCheckoutAccess> {
  const cookieStore = await cookies();
  const reviewSessionValid = validateMaibReviewSession(cookieStore.get(MAIB_REVIEW_COOKIE)?.value, environment);
  if (reviewSessionValid) return resolveRetailCheckoutAccess({ publicEnabled: isRetailCheckoutEnabled(environment), reviewSessionValid, pilotSessionValid: false });
  if (isRetailCheckoutEnabled(environment)) return resolveRetailCheckoutAccess({ publicEnabled: true, reviewSessionValid: false, pilotSessionValid: false });
  const token = cookieStore.get(RETAIL_CHECKOUT_PILOT_COOKIE)?.value;
  const tokenHash = token ? hashRetailCheckoutPilotToken(token) : null;
  if (!tokenHash) return resolveRetailCheckoutAccess({ publicEnabled: false, reviewSessionValid: false, pilotSessionValid: false });
  const pilotSessionValid = await pilotRepository.validate(tokenHash).catch(() => false);
  return resolveRetailCheckoutAccess({ publicEnabled: false, reviewSessionValid: false, pilotSessionValid });
}
export async function hasRetailCheckoutAccess(environment: Record<string, string | undefined> = process.env) { return (await getRetailCheckoutAccess(environment)).allowed; }
export async function hasMaibReviewSession(environment: Record<string, string | undefined> = process.env) { return (await getRetailCheckoutAccess(environment)).source === "maib_review"; }
export function getRetailCheckoutPilotRepository() { return pilotRepository; }
