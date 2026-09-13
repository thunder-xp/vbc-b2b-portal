import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { AuthSmsRateLimitRepository } from "./auth-sms.service";

export class SupabaseAuthSmsRateLimitRepository implements AuthSmsRateLimitRepository {
  async reserve(phoneKeyHash: string): Promise<boolean> {
    const { data, error } = await createAdminClient().rpc("reserve_customer_auth_sms_delivery", {
      p_phone_key_hash: phoneKeyHash,
      p_limit: 5,
      p_window_minutes: 10,
    });
    if (error || typeof data !== "boolean") return false;
    return data;
  }
}
