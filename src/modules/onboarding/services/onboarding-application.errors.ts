export const ONBOARDING_APPLICATION_ERROR_CODES = [
  "ONBOARDING_APPLICATION_NOT_FOUND",
  "ONBOARDING_ACCESS_DENIED",
  "ONBOARDING_INVALID_STATE",
  "ONBOARDING_1C_MATCH_REQUIRED",
  "ONBOARDING_ALREADY_DECIDED",
  "ONBOARDING_ACTIVATION_FAILED",
  "ONBOARDING_LOAD_FAILED",
] as const;

export type OnboardingApplicationErrorCode =
  (typeof ONBOARDING_APPLICATION_ERROR_CODES)[number];

export class OnboardingApplicationError extends Error {
  constructor(readonly code: OnboardingApplicationErrorCode) {
    super(code);
    this.name = "OnboardingApplicationError";
  }
}
