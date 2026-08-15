import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";
import { createClient } from "@/src/lib/supabase/server";

import type { RetailCheckoutPilotRepository } from "../retail-checkout-pilot.repository";

export class SupabaseRetailCheckoutPilotRepository implements RetailCheckoutPilotRepository {
  async validate(tokenHash: string) {
    const { data, error } = await createPublicReadClient({ cache: "no-store" }).rpc("validate_retail_checkout_pilot_session", { p_token_hash: tokenHash });
    if (error) throw new Error("RETAIL_CHECKOUT_PILOT_VALIDATION_FAILED");
    return data === true;
  }

  async issue(input: { tokenHash: string; expiresAt: string; reason: string }) {
    const { data, error } = await (await createClient()).rpc("admin_issue_retail_checkout_pilot_session", {
      p_token_hash: input.tokenHash,
      p_expires_at: input.expiresAt,
      p_reason: input.reason,
    });
    if (error || !data || typeof data !== "object") throw new Error("RETAIL_CHECKOUT_PILOT_ISSUE_FAILED");
    const value = data as Record<string, unknown>;
    if (typeof value.id !== "string" || typeof value.expiresAt !== "string") throw new Error("RETAIL_CHECKOUT_PILOT_ISSUE_INVALID_RESPONSE");
    return { id: value.id, expiresAt: value.expiresAt };
  }

  async revoke(input: { tokenHash: string; reason: string }) {
    const { data, error } = await (await createClient()).rpc("admin_revoke_retail_checkout_pilot_session", {
      p_token_hash: input.tokenHash,
      p_reason: input.reason,
    });
    if (error) throw new Error("RETAIL_CHECKOUT_PILOT_REVOKE_FAILED");
    return data === true;
  }
}
