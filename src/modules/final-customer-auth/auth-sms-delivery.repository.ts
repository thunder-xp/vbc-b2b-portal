import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  AuthSmsDeliveryAuditRepository,
  AuthSmsDeliveryCompletion,
  AuthSmsDeliveryRegistration,
} from "./auth-sms.service";

const registrationSchema = z.object({
  result: z.enum(["DISPATCH", "ALREADY_ACCEPTED", "IN_PROGRESS", "FAILED_FINAL", "EXHAUSTED"]),
  isNew: z.boolean(),
  attemptCount: z.number().int().min(0).max(3),
});

export class SupabaseAuthSmsDeliveryAuditRepository implements AuthSmsDeliveryAuditRepository {
  async begin(input: Parameters<AuthSmsDeliveryAuditRepository["begin"]>[0]): Promise<AuthSmsDeliveryRegistration> {
    const { data, error } = await createAdminClient().rpc("begin_auth_sms_delivery_attempt_v1", {
      p_correlation_id: input.correlationId,
      p_auth_user_id: input.authUserId,
      p_phone_key_hash: input.phoneKeyHash,
      p_recipient_suffix: input.recipientSuffix,
      p_purpose: input.purpose,
      p_intent: input.intent,
      p_transport: input.transport,
    });
    if (error) throw new Error("AUTH_SMS_AUDIT_BEGIN_FAILED");
    return registrationSchema.parse(data);
  }

  async startProviderAttempt(correlationId: string) {
    const { data, error } = await createAdminClient().rpc("start_auth_sms_provider_attempt_v1", {
      p_correlation_id: correlationId,
    });
    if (error || typeof data !== "number") throw new Error("AUTH_SMS_AUDIT_ATTEMPT_FAILED");
    return data;
  }

  async complete(input: AuthSmsDeliveryCompletion) {
    const { data, error } = await createAdminClient().rpc("complete_auth_sms_delivery_attempt_v1", {
      p_correlation_id: input.correlationId,
      p_delivery_state: input.deliveryState,
      p_stage: input.stage,
      p_provider_http_status: input.providerHttpStatus,
      p_provider_code: input.providerCode,
      p_provider_timestamp: input.providerTimestamp,
      p_safe_error_code: input.safeErrorCode,
      p_retry_state: input.retryState,
    });
    if (error || data !== true) throw new Error("AUTH_SMS_AUDIT_COMPLETE_FAILED");
  }
}
