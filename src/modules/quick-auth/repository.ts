import type { QuickAuthChallenge, QuickAuthStart } from "./types";

export interface QuickAuthRepository {
  start(input: {
    phoneE164: string;
    phoneKeyHash: string;
    requesterKeyHash: string;
    businessPhoneOtpEnabled: boolean;
  }): Promise<QuickAuthStart>;
  read(challengeId: string, phoneKeyHash: string): Promise<QuickAuthChallenge | null>;
  getAuthUserEmail(authUserId: string): Promise<string | null>;
  reserveBusinessEmailAttempt(challengeId: string, phoneKeyHash: string): Promise<boolean>;
  confirmBusinessEmail(challengeId: string, phoneKeyHash: string): Promise<boolean>;
  reserveOtpSend(challengeId: string, phoneKeyHash: string): Promise<boolean>;
  reserveOtpVerification(challengeId: string, phoneKeyHash: string): Promise<boolean>;
  completeOrphanRebind(input: {
    challengeId: string;
    phoneE164: string;
    phoneKeyHash: string;
    proofAuthUserId: string;
  }): Promise<boolean>;
  complete(challengeId: string, phoneKeyHash: string, phoneE164: string): Promise<boolean>;
  setStatus(challengeId: string, phoneKeyHash: string, status: "VERIFIED" | "FAILED"): Promise<boolean>;
}

export interface QuickAuthOtpGateway {
  preparePhoneEnrollment(authUserId: string, phoneE164: string): Promise<void>;
  send(phoneE164: string): Promise<void>;
  verify(phoneE164: string, token: string): Promise<{ authUserId: string }>;
  establishCanonicalSession(authUserId: string): Promise<{ authUserId: string }>;
  signOut(): Promise<void>;
}
