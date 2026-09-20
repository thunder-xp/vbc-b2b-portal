export type BusinessPhoneEnrollmentPublicState =
  | { ok: true; step: "OTP"; challengeId: string; maskedPhone: string }
  | { ok: true; step: "CONFIRMED" }
  | { ok: false; error: "INVALID_PHONE" | "INVALID_CODE" | "PHONE_CONFLICT" | "AUTH_REQUIRED" | "NOT_ELIGIBLE" | "EXPIRED" | "RATE_LIMITED" | "UNAVAILABLE" };

export type BusinessPhoneEnrollmentPreparation =
  | { result: "READY"; challengeId: string; expiresAt: string; isPhoneChange: boolean }
  | { result: "CONFLICT" }
  | { result: "ALREADY_CONFIRMED" };
