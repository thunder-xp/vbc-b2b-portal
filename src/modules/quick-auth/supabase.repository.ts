import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { canonicalMoldovaE164 } from "@/src/modules/final-customer-auth/auth-phone";

import type { QuickAuthOtpGateway, QuickAuthRepository } from "./repository";
import { QuickAuthRateLimitError } from "./service";
import { QUICK_AUTH_RESOLUTIONS } from "./types";

const startSchema = z.object({
  challengeId: z.uuid(),
  resolution: z.enum(QUICK_AUTH_RESOLUTIONS),
  subjectAuthUserId: z.uuid().nullable(),
  otpSubjectAuthUserId: z.uuid().nullable(),
  emailRequired: z.boolean(),
  recoveryKind: z.enum(["DIRECT", "PHONE_ENROLLMENT", "ORPHAN_REBIND"]).nullable(),
  phoneRebound: z.boolean(),
  expiresAt: z.string(),
  maskedPhone: z.string(),
});

const challengeSchema = z.object({
  challengeId: z.uuid(),
  resolution: z.enum(QUICK_AUTH_RESOLUTIONS),
  status: z.enum(["OPEN", "OTP_SENT", "VERIFIED", "FAILED"]),
  subjectAuthUserId: z.uuid().nullable(),
  otpSubjectAuthUserId: z.uuid().nullable(),
  emailRequired: z.boolean(),
  recoveryKind: z.enum(["DIRECT", "PHONE_ENROLLMENT", "ORPHAN_REBIND"]).nullable(),
  phoneRebound: z.boolean(),
  expiresAt: z.string(),
});

export class SupabaseQuickAuthRepository implements QuickAuthRepository {
  async start(input: Parameters<QuickAuthRepository["start"]>[0]) {
    const { data, error } = await createAdminClient().rpc("start_quick_auth_challenge_v1", {
      p_phone_e164: input.phoneE164,
      p_phone_key_hash: input.phoneKeyHash,
      p_requester_key_hash: input.requesterKeyHash,
      p_business_phone_otp_enabled: input.businessPhoneOtpEnabled,
    });
    if (error?.message.includes("quick_auth_rate_limited")) throw new QuickAuthRateLimitError();
    if (error) throw new Error(`Quick Auth start failed: ${error.code ?? "UNKNOWN"}`);
    return startSchema.parse(data);
  }

  async read(challengeId: string, phoneKeyHash: string) {
    const { data, error } = await createAdminClient().rpc("read_quick_auth_challenge_v1", {
      p_challenge_id: challengeId,
      p_phone_key_hash: phoneKeyHash,
    });
    if (error) throw new Error(`Quick Auth challenge read failed: ${error.code ?? "UNKNOWN"}`);
    return data ? challengeSchema.parse(data) : null;
  }

  async getAuthUserEmail(authUserId: string) {
    const { data, error } = await createAdminClient().auth.admin.getUserById(authUserId);
    if (error || !data.user || data.user.id !== authUserId) return null;
    return data.user.email ?? null;
  }

  async reserveBusinessEmailAttempt(challengeId: string, phoneKeyHash: string) {
    const { data, error } = await createAdminClient().rpc("reserve_quick_auth_business_email_attempt_v1", {
      p_challenge_id: challengeId,
      p_phone_key_hash: phoneKeyHash,
    });
    if (error) return false;
    return data === true;
  }

  async confirmBusinessEmail(challengeId: string, phoneKeyHash: string) {
    const { data, error } = await createAdminClient().rpc("confirm_quick_auth_business_email_v1", {
      p_challenge_id: challengeId,
      p_phone_key_hash: phoneKeyHash,
    });
    if (error) return false;
    return data === true;
  }

  async setStatus(challengeId: string, phoneKeyHash: string, status: "VERIFIED" | "FAILED") {
    const { data, error } = await createAdminClient().rpc("set_quick_auth_challenge_status_v1", {
      p_challenge_id: challengeId,
      p_phone_key_hash: phoneKeyHash,
      p_status: status,
    });
    if (error) return false;
    return data === true;
  }

  async reserveOtpSend(challengeId: string, phoneKeyHash: string) {
    const { data, error } = await createAdminClient().rpc("reserve_quick_auth_otp_send_v1", {
      p_challenge_id: challengeId,
      p_phone_key_hash: phoneKeyHash,
    });
    if (error) return false;
    return data === true;
  }

  async reserveOtpVerification(challengeId: string, phoneKeyHash: string) {
    const { data, error } = await createAdminClient().rpc("reserve_quick_auth_otp_verification_v1", {
      p_challenge_id: challengeId,
      p_phone_key_hash: phoneKeyHash,
    });
    if (error) return false;
    return data === true;
  }

  async completeOrphanRebind(input: Parameters<QuickAuthRepository["completeOrphanRebind"]>[0]) {
    const { data, error } = await createAdminClient().rpc("complete_quick_auth_orphan_rebind_v1", {
      p_challenge_id: input.challengeId,
      p_phone_e164: input.phoneE164,
      p_phone_key_hash: input.phoneKeyHash,
      p_proof_auth_user_id: input.proofAuthUserId,
    });
    if (error) return false;
    return data === true;
  }

  async complete(challengeId: string, phoneKeyHash: string, phoneE164: string) {
    const { data, error } = await createAdminClient().rpc("complete_quick_auth_challenge_v1", {
      p_challenge_id: challengeId,
      p_phone_key_hash: phoneKeyHash,
      p_phone_e164: phoneE164,
    });
    if (error) return false;
    return data === true;
  }
}

export class SupabaseQuickAuthOtpGateway implements QuickAuthOtpGateway {
  async preparePhoneEnrollment(authUserId: string, phoneE164: string) {
    const admin = createAdminClient();
    const current = await admin.auth.admin.getUserById(authUserId);
    if (current.error || !current.data.user || current.data.user.id !== authUserId) {
      throw new Error("Quick Auth subject is unavailable.");
    }
    const currentPhone = current.data.user.phone ? canonicalMoldovaE164(current.data.user.phone) : null;
    if (currentPhone === phoneE164 && current.data.user.phone_confirmed_at) return;
    if (currentPhone && currentPhone !== phoneE164 && current.data.user.phone_confirmed_at) {
      throw new Error("Quick Auth subject already has another confirmed phone.");
    }
    const updated = await admin.auth.admin.updateUserById(authUserId, {
      phone: phoneE164,
      phone_confirm: false,
    });
    if (updated.error || !updated.data.user || updated.data.user.id !== authUserId) {
      throw new Error("Quick Auth phone enrollment preparation failed.");
    }
  }

  async send(phoneE164: string) {
    const { error } = await (await createClient()).auth.signInWithOtp({
      phone: phoneE164,
      options: { shouldCreateUser: false },
    });
    if (error) throw new Error("Quick Auth OTP send failed.");
  }

  async verify(phoneE164: string, token: string) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ phone: phoneE164, token, type: "sms" });
    if (error || !data.session || !data.user) throw new Error("Quick Auth OTP verification failed.");
    return { authUserId: data.user.id };
  }

  async establishCanonicalSession(authUserId: string) {
    const admin = createAdminClient();
    const current = await admin.auth.admin.getUserById(authUserId);
    const email = current.data.user?.email?.trim().toLowerCase();
    if (current.error || !current.data.user || current.data.user.id !== authUserId || !email) {
      throw new Error("Quick Auth canonical subject is unavailable.");
    }
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (
      generated.error
      || !generated.data.user
      || generated.data.user.id !== authUserId
      || !generated.data.properties?.hashed_token
    ) {
      throw new Error("Quick Auth canonical session proof failed.");
    }
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: generated.data.properties.hashed_token,
      type: "magiclink",
    });
    if (error || !data.session || !data.user || data.user.id !== authUserId) {
      throw new Error("Quick Auth canonical session establishment failed.");
    }
    return { authUserId: data.user.id };
  }

  async signOut() {
    await (await createClient()).auth.signOut({ scope: "local" });
  }
}
