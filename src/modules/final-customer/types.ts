export type CustomerIdentityResolutionStatus = "MATCHED" | "NEW" | "AMBIGUOUS" | "CONFLICT";

export type FinalCustomerAccount = Readonly<{
  id: string;
  authUserId: string;
  customerIdentityId: string | null;
  status: "ACTIVE" | "IDENTITY_REVIEW_REQUIRED" | "SUSPENDED";
  identityResolutionStatus: CustomerIdentityResolutionStatus;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  lastLoginAt: string;
}>;

export type FinalCustomerOrderSummary = Readonly<{
  id: string;
  number: string;
  status: string;
  createdAt: string;
  total: number;
  currency: string;
}>;

export type FinalCustomerContext = Readonly<{
  account: FinalCustomerAccount;
  verifiedPhone: string;
  displayName: string | null;
  aal: "aal1" | "aal2" | null;
}>;
