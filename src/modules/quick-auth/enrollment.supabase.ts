import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { BusinessPhoneEnrollmentAuthGateway, BusinessPhoneEnrollmentRepository } from "./enrollment.repository";

const preparationSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("READY"), challengeId: z.uuid(), expiresAt: z.string(), isPhoneChange: z.boolean() }),
  z.object({ result: z.literal("CONFLICT") }),
  z.object({ result: z.literal("ALREADY_CONFIRMED") }),
]);

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
    const { data, error } = await createAdminClient().rpc("reserve_business_phone_enrollment_send_v1", {
      p_challenge_id: input.challengeId,
      p_auth_user_id: input.authUserId,
      p_phone_e164: input.phoneE164,
      p_phone_key_hash: input.phoneKeyHash,
    });
    return !error && data === true;
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
    await createAdminClient().rpc("fail_business_phone_enrollment_v1", {
      p_challenge_id: input.challengeId,
      p_auth_user_id: input.authUserId,
      p_phone_key_hash: input.phoneKeyHash,
    });
  }
}

export class SupabaseBusinessPhoneEnrollmentAuthGateway implements BusinessPhoneEnrollmentAuthGateway {
  async currentUser() {
    const { data, error } = await (await createClient()).auth.getUser();
    if (error || !data.user) return null;
    return authUserState(data.user);
  }

  async requestPhoneChange(phoneE164: string) {
    const { data, error } = await (await createClient()).auth.updateUser({ phone: phoneE164 });
    if (error || !data.user) throw new Error("Business phone enrollment request failed.");
    return { authUserId: data.user.id };
  }

  async resendPhoneChange(phoneE164: string) {
    const { error } = await (await createClient()).auth.resend({ type: "phone_change", phone: phoneE164 });
    if (error) throw new Error("Business phone enrollment resend failed.");
  }

  async verifyPhoneChange(phoneE164: string, token: string) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token, type: "phone_change" });
    if (error) throw new Error("Business phone enrollment verification failed.");
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) throw new Error("Business phone enrollment identity refresh failed.");
    return authUserState(data.user);
  }
}

function authUserState(user: { id: string; phone?: string; phone_confirmed_at?: string }) {
  return {
    id: user.id,
    authUserId: user.id,
    phone: user.phone ?? null,
    phoneConfirmed: Boolean(user.phone && user.phone_confirmed_at),
  };
}
