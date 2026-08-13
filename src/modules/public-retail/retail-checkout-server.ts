import "server-only";

import { SupabaseRetailCheckoutRepository } from "./repositories/supabase/retail-checkout.supabase-repository";
import { RetailCheckoutService } from "./services/retail-checkout.service";

const service = new RetailCheckoutService(new SupabaseRetailCheckoutRepository());
export function getRetailCheckoutService() { return service; }
export function isRetailCheckoutEnabled(environment: Record<string, string | undefined> = process.env) { return environment.RETAIL_CHECKOUT_ENABLED === "true"; }
