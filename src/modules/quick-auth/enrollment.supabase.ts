import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { BusinessPhoneEnrollmentAuthGateway, BusinessPhoneEnrollmentRepository } from "./enrollment.repository";
import { BusinessPhoneAuthError } from "./enrollment.errors";
import type { BusinessProfilePhoneStateRepository } from "./profile-phone-state";

const preparationSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("READY"), challengeId: z.uuid(), expiresAt: z.string(), isPhoneChange: z.boolean() }),
  z.object({ result: z.literal("CONFLICT") }),
  z.object({ result: z.literal("ALREADY_CONFIRMED") }),
]);
const sendReservationSchema = z.object({ allowed: z.boolean(), retryAfterSeconds: z.number().int().nonnegative() });

export class SupabaseBusinessPhoneEnrollmentRepository implements BusinessPhoneEnrollmentRepository {
  async prepare(input: Parameters<BusinessPhoneEnrollmentRepository["prepare"]>[0]) {
    const { data, error } = await createAdminClient().rpc("prepare_business_phone_enrollment_v1", {
      p_auth_user_id: input.authUserId,
      p_phone_e164: input.phoneE164,
      p_phone_key_hash: input.phoneKeyHash,
    });
    if (error) throw new Error(`Business phone enrollment preparation failed: ${error.message}`);
    return preparationSchema.parse(data);
  }

  async reserveSend(input: Parameters<BusinessPhoneEnrollmentRepository["reserveSend"]>[0]) {
    const { data, error } = await createAdminClient().rpc("reserve_business_phone_enrollment_send_v2", {
      p_challenge_id: input.challengeId,
      p_auth_user_id: input.authUserId,
      p_phone_e164: input.phoneE164,
      p_phone_key_hash: input.phoneKeyHash,
    });
    if (error) return { allowed: false, retryAfterSeconds: 60 };
    return sendReservationSchema.parse(data);
  }

  async reserveVerification(input: Parameters<BusinessPhoneEnrollmentRepository["reserveVerification"]>[0]) {
    const { data, error } = await createAdminClient().rpc("reserve_business_phone_enrollment_verification_v1", {
      p_challenge_id: input.challengeId,
      p_auth_user_id: input.authUserId,
      p_phone_key_hash: input.phoneKeyHash,
    });
    return !error && data === true;
  }

  async complete(input: Parameters<BusinessPhoneEnrollmentRepository["complete"]>[0]) {
    const { data, error } = await createAdminClient().rpc("complete_business_phone_enrollment_v1", {
      p_challenge_id: input.challengeId,
      p_auth_user_id: input.authUserId,
      p_phone_e164: input.phoneE164,
      p_phone_key_hash: input.phoneKeyHash,
    });
    return !error && data === true;
  }

  async fail(input: Parameters<BusinessPhoneEnrollmentRepository["fail"]>[0]) {
    await createAdminClient().rpc("fail_business_phone_enrollment_v2", {
      p_challenge_id: input.challengeId,
      p_auth_user_id: input.authUserId,
      p_phone_key_hash: input.phoneKeyHash,
      p_failure_stage: input.failureStage ?? null,
      p_safe_error_code: input.safeErrorCode ?? null,
    });
  }

  async recordVerification(input: Parameters<BusinessPhoneEnrollmentRepository["recordVerification"]>[0]) {
    const { error } = await createAdminClient().rpc("record_business_phone_enrollment_verification_result_v1", {
      p_challenge_id: input.challengeId,
      p_auth_user_id: input.authUserId,
      p_phone_key_hash: input.phoneKeyHash,
      p_verification_state: input.state,
      p_safe_error_code: input.safeErrorCode,
    });
    if (error) throw new Error("Business phone enrollment verification audit failed.");
  }
}

export class SupabaseBusinessProfilePhoneStateRepository implements BusinessProfilePhoneStateRepository {
  async getProfilePhone(authUserId: string) {
    const { data, error } = await createAdminClient()
      .from("user_profiles")
      .select("phone")
      .eq("id", authUserId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error("Business profile phone lookup failed.");
    return data?.phone ?? null;
  }

  async hasOperationalConflict(authUserId: string, phoneE164: string) {
    const { data, error } = await createAdminClient().rpc(
      "has_business_profile_phone_operational_conflict_v2",
      { p_auth_user_id: authUserId, p_phone_e164: phoneE164 },
    );
    if (error || typeof data !== "boolean") {
      throw new Error("Business profile phone conflict lookup failed.");
    }
    return data;
  }
}

export class SupabaseBusinessPhoneEnrollmentAuthGateway implements BusinessPhoneEnrollmentAuthGateway {
  async currentUser() {
    const { data, error } = await (await createClient()).auth.getUser();
    if (error || !data.user) return null;
    return authUserState(data.user);
  }

  async requestPhoneVerification(phoneE164: string) {
    const client = await createClient();
    const { data, error } = await client.auth.updateUser({ phone: phoneE164 });
    if (error || !data.user) throw new BusinessPhoneAuthError(safeAuthErrorCode(error));
    return { authUserId: data.user.id };
  }

  async resendPhoneVerification(phoneE164: string) {
    const { error } = await (await createClient()).auth.resend({ type: "phone_change", phone: phoneE164 });
    if (error) throw new BusinessPhoneAuthError(safeAuthErrorCode(error));
  }

  async verifyPhoneVerification(phoneE164: string, token: string) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token, type: "phone_change" });
    if (error) throw new BusinessPhoneAuthError(safeAuthErrorCode(error));
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) throw new Error("Business phone enrollment identity refresh failed.");
    return authUserState(data.user);
  }
}

function safeAuthErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "AUTH_UNKNOWN";
  const value = "code" in error && typeof error.code === "string" ? error.code : "UNKNOWN";
  return `AUTH_${value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 70)}`;
}

function authUserState(user: { id: string; phone?: string; phone_confirmed_at?: string }) {
  return {
    id: user.id,
    authUserId: user.id,
    phone: user.phone ?? null,
    phoneConfirmed: Boolean(user.phone && user.phone_confirmed_at),
  };
}
