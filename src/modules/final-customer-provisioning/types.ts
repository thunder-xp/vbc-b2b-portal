export type ClaimedCustomerProvisioningEvent = Readonly<{
  eventId: string;
  retailOrderId: string;
  leaseToken: string;
  attemptCount: number;
}>;

export type CustomerProvisioningResult = Readonly<{
  outcome: "CREATED" | "REUSED" | "NEEDS_REVIEW";
  customerAccountId: string | null;
  customerIdentityId: string | null;
  entitlementId: string | null;
  oneCJobState: "PENDING" | null;
}>;

export type VerifiedRetailOwner = Readonly<{
  authUserId: string;
  verifiedPhone: string;
  phoneKeyHash: string;
  phoneKeyVersion: number;
  displayName: string | null;
  email: string | null;
}>;
