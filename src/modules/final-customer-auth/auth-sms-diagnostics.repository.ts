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

const fleetSummarySchema = z.object({
  totalActiveB2b: z.number().int().nonnegative(),
  verifiedHealthy: z.number().int().nonnegative(),
  noPhone: z.number().int().nonnegative(),
  pendingVerification: z.number().int().nonnegative(),
  authProfilePhoneMismatch: z.number().int().nonnegative(),
  verifiedStateMismatch: z.number().int().nonnegative(),
  malformedPhone: z.number().int().nonnegative(),
  duplicatePhone: z.number().int().nonnegative(),
  stalePendingChallenge: z.number().int().nonnegative(),
  staleRateLimit: z.number().int().nonnegative(),
  recentDeliveryFailure: z.number().int().nonnegative(),
  orphanedAuthPhone: z.number().int().nonnegative(),
  orphanedProfilePhone: z.number().int().nonnegative(),
});

const healthWindowSchema = z.object({
  window_name: z.enum(["24h", "7d", "30d"]),
  challenge_attempts: z.number().int().nonnegative(),
  send_attempts: z.number().int().nonnegative(),
  provider_accepted: z.number().int().nonnegative(),
  provider_rejected: z.number().int().nonnegative(),
  network_failures: z.number().int().nonnegative(),
  verification_success: z.number().int().nonnegative(),
  verification_failure: z.number().int().nonnegative(),
  challenge_expiration: z.number().int().nonnegative(),
});

const fleetAccountSchema = z.object({
  authUserId: z.uuid(),
  account: z.string().nullable(),
  companies: z.array(z.string()),
  maskedPhone: z.string(),
  classifications: z.array(z.string()),
  stage: z.string().nullable(),
  safeCode: z.string().nullable(),
  provider: z.string().nullable(),
  transport: z.string().nullable(),
  httpStatus: z.number().int().nullable(),
  providerCode: z.string().nullable(),
  attempt: z.number().int().nonnegative(),
  correlationId: z.uuid().nullable(),
  time: z.string().nullable(),
  recovery: z.string(),
});

const businessPhoneHealthSchema = z.object({
  summary: fleetSummarySchema,
  windows: z.array(healthWindowSchema),
  accounts: z.array(fleetAccountSchema),
});

export type BusinessPhoneHealth = z.infer<typeof businessPhoneHealthSchema>;

export class SupabaseAuthSmsDiagnosticsRepository {
  async list(limit = 20): Promise<readonly AuthSmsDiagnostic[]> {
    const { data, error } = await (await createClient()).rpc("get_admin_auth_sms_diagnostics_v1", {
      p_limit: limit,
    });
    const parsed = z.array(itemSchema).safeParse(data);
    if (error || !parsed.success) throw new Error("Auth SMS diagnostics unavailable.");
    return parsed.data;
  }

  async health(limit = 50): Promise<BusinessPhoneHealth> {
    const { data, error } = await (await createClient()).rpc("get_admin_business_phone_health_v1", {
      p_auth_user_id: null,
      p_limit: limit,
    });
    const parsed = businessPhoneHealthSchema.safeParse(data);
    if (error || !parsed.success) throw new Error("Business phone health unavailable.");
    return parsed.data;
  }
}
