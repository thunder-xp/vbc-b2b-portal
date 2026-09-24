export type AuthEmailRecoveryIdentity = Readonly<{
  id: string;
  email: string;
  emailConfirmedAt: string | null;
  createdAt: string;
  locale: "ru" | "ro";
  registrationIntent: "agent" | "installer";
}>;

export type AuthEmailRecoveryAttempt = Readonly<{
  id: string;
  authUserId: string;
  correlationId: string;
  status: "RESERVED" | "GENERATED" | "DELIVERY_ACCEPTED" | "DELIVERY_FAILED" | "VERIFIED";
  deliveryResult: string;
  verificationResult: "PENDING" | "ACCEPTED";
  generatedAt: string | null;
  createdAt: string;
}>;

export type AuthEmailRecoveryReservation = Readonly<{
  attemptId: string | null;
  outcome: "RESERVED" | "ALREADY_DELIVERED" | "IN_PROGRESS" | "PREVIOUSLY_FAILED" | "RATE_LIMITED";
  status: AuthEmailRecoveryAttempt["status"] | null;
}>;

export type GeneratedSignupLink = Readonly<{
  actionLink: string;
  emailOtp: string;
  userId: string;
}>;

export interface AuthEmailRecoveryRepository {
  findExactAuthUsers(email: string): Promise<AuthEmailRecoveryIdentity[]>;
  getAuthUserById(authUserId: string): Promise<AuthEmailRecoveryIdentity | null>;
  getProfileState(authUserId: string): Promise<{ exists: boolean; status: string | null }>;
  getLatestAttempt(authUserId: string): Promise<AuthEmailRecoveryAttempt | null>;
  reserveAttempt(input: Readonly<{
    authUserId: string;
    actorUserId: string;
    maskedEmail: string;
    emailDomain: string;
    correlationId: string;
    originalErrorCode: "email_address_invalid";
  }>): Promise<AuthEmailRecoveryReservation>;
  generateSignupLink(input: Readonly<{
    email: string;
    redirectTo: string;
  }>): Promise<GeneratedSignupLink>;
  recordOutcome(input: Readonly<{
    attemptId: string;
    correlationId: string;
    outcome: "LINK_GENERATED" | "DELIVERY_ACCEPTED" | "DELIVERY_FAILED" | "VERIFICATION_ACCEPTED";
    deliveryResult?: string;
  }>): Promise<void>;
}
