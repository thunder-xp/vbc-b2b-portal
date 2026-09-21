import type { BusinessPhoneEnrollmentPreparation } from "./enrollment.types";

export interface BusinessPhoneEnrollmentRepository {
  prepare(input: { authUserId: string; phoneE164: string; phoneKeyHash: string }): Promise<BusinessPhoneEnrollmentPreparation>;
  reserveSend(input: { challengeId: string; authUserId: string; phoneE164: string; phoneKeyHash: string }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  reserveVerification(input: { challengeId: string; authUserId: string; phoneKeyHash: string }): Promise<boolean>;
  complete(input: { challengeId: string; authUserId: string; phoneE164: string; phoneKeyHash: string }): Promise<boolean>;
  fail(input: { challengeId: string; authUserId: string; phoneKeyHash: string; failureStage?: "AUTH_CHALLENGE_CREATE" | "AUTH_RESEND" | "VERIFICATION"; safeErrorCode?: string }): Promise<void>;
  recordVerification(input: { challengeId: string; authUserId: string; phoneKeyHash: string; state: "VERIFIED" | "FAILED"; safeErrorCode: string | null }): Promise<void>;
}

export interface BusinessPhoneEnrollmentAuthGateway {
  currentUser(): Promise<{ id: string; phone: string | null; phoneConfirmed: boolean } | null>;
  requestPhoneVerification(phoneE164: string): Promise<{ authUserId: string }>;
  resendPhoneVerification(phoneE164: string): Promise<void>;
  verifyPhoneVerification(phoneE164: string, token: string): Promise<{ authUserId: string; phone: string | null; phoneConfirmed: boolean }>;
}
