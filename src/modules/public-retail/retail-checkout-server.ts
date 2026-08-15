import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { SupabaseRetailCheckoutRepository } from "./repositories/supabase/retail-checkout.supabase-repository";
import { SupabaseRetailCheckoutPilotRepository } from "./repositories/supabase/retail-checkout-pilot.supabase-repository";
import { RetailCheckoutService } from "./services/retail-checkout.service";

const service = new RetailCheckoutService(new SupabaseRetailCheckoutRepository());
const pilotRepository = new SupabaseRetailCheckoutPilotRepository();
export const RETAIL_CHECKOUT_PILOT_COOKIE = "novotech_retail_checkout_pilot";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export function getRetailCheckoutService() { return service; }
export function isRetailCheckoutEnabled(environment: Record<string, string | undefined> = process.env) { return environment.RETAIL_CHECKOUT_ENABLED === "true"; }
export function hashRetailCheckoutPilotToken(token: string) { return TOKEN.test(token) ? createHash("sha256").update(token, "utf8").digest("hex") : null; }
export async function hasRetailCheckoutAccess(environment: Record<string, string | undefined> = process.env) {
  if (isRetailCheckoutEnabled(environment)) return true;
  const token = (await cookies()).get(RETAIL_CHECKOUT_PILOT_COOKIE)?.value;
  const tokenHash = token ? hashRetailCheckoutPilotToken(token) : null;
  if (!tokenHash) return false;
  return pilotRepository.validate(tokenHash).catch(() => false);
}
export function getRetailCheckoutPilotRepository() { return pilotRepository; }
