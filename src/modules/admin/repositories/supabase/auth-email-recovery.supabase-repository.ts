import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";

import { getSupabaseAdminEnv } from "@/src/lib/env";
import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  AuthEmailRecoveryAttempt,
  AuthEmailRecoveryIdentity,
  AuthEmailRecoveryRepository,
  AuthEmailRecoveryReservation,
  GeneratedSignupLink,
} from "../auth-email-recovery.repository";

const UUID = z.string().uuid();
const authUsersResponse = z.object({
  users: z.array(z.object({
    id: UUID,
    email: z.string(),
    email_confirmed_at: z.string().nullable().optional(),
    created_at: z.string(),
    user_metadata: z.record(z.string(), z.unknown()).optional().default({}),
  }).passthrough()),
});

const reservationSchema = z.object({
  attemptId: UUID.nullable(),
  outcome: z.enum(["RESERVED", "ALREADY_DELIVERED", "IN_PROGRESS", "PREVIOUSLY_FAILED", "RATE_LIMITED"]),
  status: z.enum(["RESERVED", "GENERATED", "DELIVERY_ACCEPTED", "DELIVERY_FAILED", "VERIFIED"]).nullable(),
});

type AttemptRow = {
  id: string;
  auth_user_id: string;
  correlation_id: string;
  status: AuthEmailRecoveryAttempt["status"];
  delivery_result: string;
  verification_result: AuthEmailRecoveryAttempt["verificationResult"];
  generated_at: string | null;
  created_at: string;
};

export class SupabaseAuthEmailRecoveryRepository implements AuthEmailRecoveryRepository {
  async findExactAuthUsers(email: string): Promise<AuthEmailRecoveryIdentity[]> {
    const normalized = email.trim().toLowerCase();
    const { url, serviceRoleKey } = getSupabaseAdminEnv();
    const endpoint = new URL("/auth/v1/admin/users", url);
    endpoint.searchParams.set("filter", normalized);
    endpoint.searchParams.set("page", "1");
    endpoint.searchParams.set("per_page", "100");
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new AuthEmailRecoveryProviderError("AUTH_LOOKUP_FAILED");
    const parsed = authUsersResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new AuthEmailRecoveryProviderError("AUTH_LOOKUP_FAILED");
    return parsed.data.users
      .filter((user) => user.email.trim().toLowerCase() === normalized)
      .map(mapIdentity);
  }

  async getAuthUserById(authUserId: string): Promise<AuthEmailRecoveryIdentity | null> {
    const { data, error } = await createAdminClient().auth.admin.getUserById(authUserId);
    if (error) {
      if (error.status === 404) return null;
      throw new AuthEmailRecoveryProviderError("AUTH_LOOKUP_FAILED");
    }
    const parsed = authUsersResponse.shape.users.element.safeParse(data.user);
    if (!parsed.success) throw new AuthEmailRecoveryProviderError("AUTH_LOOKUP_FAILED");
    return mapIdentity(parsed.data);
  }

  async getProfileState(authUserId: string): Promise<{ exists: boolean; status: string | null }> {
    const { data, error } = await createAdminClient()
      .from("user_profiles")
      .select("status")
      .eq("id", authUserId)
      .maybeSingle();
    if (error) throw new AuthEmailRecoveryProviderError("PROFILE_LOOKUP_FAILED");
    return { exists: Boolean(data), status: typeof data?.status === "string" ? data.status : null };
  }

  async getLatestAttempt(authUserId: string): Promise<AuthEmailRecoveryAttempt | null> {
    const { data, error } = await createAdminClient()
      .from("auth_email_recovery_attempts")
      .select("id,auth_user_id,correlation_id,status,delivery_result,verification_result,generated_at,created_at")
      .eq("auth_user_id", authUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new AuthEmailRecoveryProviderError("AUDIT_READ_FAILED");
    return data ? mapAttempt(data as AttemptRow) : null;
  }

  async reserveAttempt(input: Parameters<AuthEmailRecoveryRepository["reserveAttempt"]>[0]): Promise<AuthEmailRecoveryReservation> {
    const { data, error } = await createAdminClient().rpc("reserve_auth_email_recovery_attempt", {
      p_auth_user_id: input.authUserId,
      p_actor_user_id: input.actorUserId,
      p_masked_email: input.maskedEmail,
      p_email_domain: input.emailDomain,
      p_correlation_id: input.correlationId,
      p_original_error_code: input.originalErrorCode,
    });
    if (error) throw new AuthEmailRecoveryProviderError("AUDIT_WRITE_FAILED");
    const parsed = reservationSchema.safeParse(data);
    if (!parsed.success) throw new AuthEmailRecoveryProviderError("AUDIT_WRITE_FAILED");
    return parsed.data;
  }

  async generateSignupLink(input: { email: string; redirectTo: string }): Promise<GeneratedSignupLink> {
    // For an existing unconfirmed identity Supabase ignores this random password;
    // it is required only by the SDK's signup-link type. The service rechecks the
    // returned user ID and exact-email cardinality before any delivery.
    const password = `${randomBytes(48).toString("base64url")}Aa1!`;
    const { data, error } = await createAdminClient().auth.admin.generateLink({
      type: "signup",
      email: input.email,
      password,
      options: { redirectTo: input.redirectTo },
    });
    if (error || !data.user?.id || !data.properties?.action_link || !data.properties.email_otp) {
      throw new AuthEmailRecoveryProviderError("LINK_GENERATION_FAILED");
    }
    return {
      actionLink: data.properties.action_link,
      emailOtp: data.properties.email_otp,
      userId: data.user.id,
    };
  }

  async recordOutcome(input: Parameters<AuthEmailRecoveryRepository["recordOutcome"]>[0]): Promise<void> {
    const { error } = await createAdminClient().rpc("record_auth_email_recovery_outcome", {
      p_attempt_id: input.attemptId,
      p_correlation_id: input.correlationId,
      p_outcome: input.outcome,
      p_delivery_result: input.deliveryResult ?? null,
    });
    if (error) throw new AuthEmailRecoveryProviderError("AUDIT_WRITE_FAILED");
  }
}

export type AuthEmailRecoveryProviderErrorCode =
  | "AUTH_LOOKUP_FAILED"
  | "PROFILE_LOOKUP_FAILED"
  | "AUDIT_READ_FAILED"
  | "AUDIT_WRITE_FAILED"
  | "LINK_GENERATION_FAILED";

export class AuthEmailRecoveryProviderError extends Error {
  constructor(readonly code: AuthEmailRecoveryProviderErrorCode) {
    super(code);
    this.name = "AuthEmailRecoveryProviderError";
  }
}

function mapIdentity(user: z.infer<typeof authUsersResponse>["users"][number]): AuthEmailRecoveryIdentity {
  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
    emailConfirmedAt: user.email_confirmed_at ?? null,
    createdAt: user.created_at,
    locale: user.user_metadata.preferred_registration_locale === "ro" ? "ro" : "ru",
    registrationIntent: user.user_metadata.registration_intent === "installer" ? "installer" : "agent",
  };
}

function mapAttempt(row: AttemptRow): AuthEmailRecoveryAttempt {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    correlationId: row.correlation_id,
    status: row.status,
    deliveryResult: row.delivery_result,
    verificationResult: row.verification_result,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  };
}
