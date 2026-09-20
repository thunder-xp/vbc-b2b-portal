export const QUICK_AUTH_RESOLUTIONS = [
  "CUSTOMER_OTP",
  "BUSINESS_EMAIL_REQUIRED",
  "NOT_REGISTERED",
  "BLOCKED",
  "MULTIPLE_CONTEXT_EDGE_CASE",
] as const;

export type QuickAuthResolution = (typeof QUICK_AUTH_RESOLUTIONS)[number];
export type QuickAuthChallengeStatus = "OPEN" | "OTP_SENT" | "VERIFIED" | "FAILED";
export type QuickAuthRecoveryKind = "DIRECT" | "PHONE_ENROLLMENT" | "ORPHAN_REBIND";

export type QuickAuthChallenge = {
  challengeId: string;
  resolution: QuickAuthResolution;
  status: QuickAuthChallengeStatus;
  subjectAuthUserId: string | null;
  otpSubjectAuthUserId: string | null;
  emailRequired: boolean;
  recoveryKind: QuickAuthRecoveryKind | null;
  phoneRebound: boolean;
  expiresAt: string;
};

export type QuickAuthStart = {
  challengeId: string;
  resolution: QuickAuthResolution;
  subjectAuthUserId: string | null;
  otpSubjectAuthUserId: string | null;
  emailRequired: boolean;
  recoveryKind: QuickAuthRecoveryKind | null;
  phoneRebound: boolean;
  expiresAt: string;
  maskedPhone: string;
};

export type QuickAuthPublicState =
  | { ok: true; step: "OTP"; challengeId: string; maskedPhone: string }
  | { ok: true; step: "EMAIL"; challengeId: string; maskedPhone: string }
  | { ok: true; step: "NOT_REGISTERED" }
  | { ok: true; step: "BLOCKED" }
  | { ok: false; error: "INVALID_PHONE" | "INVALID_EMAIL" | "IDENTITY_MISMATCH" | "INVALID_CODE" | "EXPIRED" | "RATE_LIMITED" | "UNAVAILABLE" };

export type QuickAuthVerifyState =
  | QuickAuthPublicState
  | { ok: true; step: "AUTHENTICATED"; redirectTo: string };
