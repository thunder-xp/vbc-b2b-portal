import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  GovernedBusinessAuthSmsIntent,
  GovernedBusinessAuthSmsRepository,
} from "./auth-sms.service";

const governedIntents = new Set<GovernedBusinessAuthSmsIntent>([
  "BUSINESS_PHONE_ENROLLMENT",
  "BUSINESS_QUICK_AUTH",
  "BUSINESS_PHONE_TARGET_MISMATCH",
]);

export class SupabaseGovernedBusinessAuthSmsRepository implements GovernedBusinessAuthSmsRepository {
  async resolve(authUserId: string, phoneKeyHash: string): Promise<GovernedBusinessAuthSmsIntent | null> {
    const { data, error } = await createAdminClient().rpc("resolve_governed_business_auth_sms_v2", {
      p_auth_user_id: authUserId,
      p_phone_key_hash: phoneKeyHash,
    });
    if (error || typeof data !== "string" || !governedIntents.has(data as GovernedBusinessAuthSmsIntent)) {
      return null;
    }
    return data as GovernedBusinessAuthSmsIntent;
  }
}
