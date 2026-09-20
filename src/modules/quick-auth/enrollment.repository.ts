import type { BusinessPhoneEnrollmentPreparation } from "./enrollment.types";

export interface BusinessPhoneEnrollmentRepository {
  prepare(input: { authUserId: string; phoneE164: string; phoneKeyHash: string }): Promise<BusinessPhoneEnrollmentPreparation>;
  reserveSend(input: { challengeId: string; authUserId: string; phoneE164: string; phoneKeyHash: string }): Promise<boolean>;
  reserveVerification(input: { challengeId: string; authUserId: string; phoneKeyHash: string }): Promise<boolean>;
  complete(input: { challengeId: string; authUserId: string; phoneE164: string; phoneKeyHash: string }): Promise<boolean>;
  fail(input: { challengeId: string; authUserId: string; phoneKeyHash: string }): Promise<void>;
}

export interface BusinessPhoneEnrollmentAuthGateway {
  currentUser(): Promise<{ id: string; phone: string | null; phoneConfirmed: boolean } | null>;
  requestPhoneChange(phoneE164: string): Promise<{ authUserId: string }>;
  resendPhoneChange(phoneE164: string): Promise<void>;
  verifyPhoneChange(phoneE164: string, token: string): Promise<{ authUserId: string; phone: string | null; phoneConfirmed: boolean }>;
}
