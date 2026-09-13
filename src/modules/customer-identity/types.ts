export const CUSTOMER_IDENTITY_KINDS = ["PERSON", "LEGAL_ENTITY"] as const;
export type CustomerIdentityKind = (typeof CUSTOMER_IDENTITY_KINDS)[number];

export const CUSTOMER_IDENTITY_KEY_TYPES = [
  "PHONE",
  "EMAIL",
  "LEGAL_IDENTIFIER",
] as const;
export type CustomerIdentityKeyType =
  (typeof CUSTOMER_IDENTITY_KEY_TYPES)[number];

export type CustomerIdentityResolutionStatus =
  | "MATCHED"
  | "NEW"
  | "AMBIGUOUS"
  | "CONFLICT";

export type CustomerIdentityResolutionReason =
  | "EXACT_1C_REF"
  | "EXACT_LEGAL_IDENTIFIER"
  | "EXACT_VERIFIED_PHONE"
  | "EXACT_VERIFIED_EMAIL"
  | "MULTIPLE_MATCHES"
  | "IDENTIFIER_CONFLICT"
  | "INSUFFICIENT_IDENTITY"
  | "NEW_IDENTITY";

export type ResolveCustomerIdentityInput = {
  customerType: CustomerIdentityKind;
  phone?: string | null;
  email?: string | null;
  legalIdentifier?: string | null;
  existing1cRef?: string | null;
  verifiedKeyTypes?: readonly CustomerIdentityKeyType[];
  createIfMissing?: boolean;
  exposeCandidateIds?: boolean;
};

export type CustomerIdentityResolution = {
  status: CustomerIdentityResolutionStatus;
  reason: CustomerIdentityResolutionReason;
  customerIdentityId: string | null;
  candidateIds: readonly string[];
};

export type HashedIdentityKey = {
  keyType: CustomerIdentityKeyType;
  keyHash: string;
  keyVersion: number;
  verified: boolean;
};

export type IdentityKeyMatch = HashedIdentityKey & {
  customerIdentityId: string;
};

export type CustomerExternalRefMatch = {
  customerIdentityId: string;
  system: string;
  entityType: string;
  externalId: string;
};
