import "server-only";

import { z } from "zod";

import { createClient } from "@/src/lib/supabase/server";

const itemSchema = z.object({
  id: z.uuid(),
  authUserId: z.uuid(),
  account: z.string().nullable(),
  maskedTarget: z.string(),
  purpose: z.string(),
  intent: z.string().nullable(),
  stage: z.string(),
  deliveryState: z.string(),
  provider: z.string(),
  transport: z.string(),
  providerHttpStatus: z.number().int().nullable(),
  providerCode: z.string().nullable(),
  providerTimestamp: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  retryState: z.string(),
  safeErrorCode: z.string().nullable(),
  verificationState: z.string(),
  correlationId: z.uuid(),
  requestedAt: z.string(),
  lastAttemptAt: z.string().nullable(),
});

export type AuthSmsDiagnostic = z.infer<typeof itemSchema>;

export class SupabaseAuthSmsDiagnosticsRepository {
  async list(limit = 20): Promise<readonly AuthSmsDiagnostic[]> {
    const { data, error } = await (await createClient()).rpc("get_admin_auth_sms_diagnostics_v1", {
      p_limit: limit,
    });
    const parsed = z.array(itemSchema).safeParse(data);
    if (error || !parsed.success) throw new Error("Auth SMS diagnostics unavailable.");
    return parsed.data;
  }
}
