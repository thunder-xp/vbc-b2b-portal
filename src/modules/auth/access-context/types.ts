export type BusinessContextType = "PARTNER" | "AGENT";
export type BusinessContextStatus = "AVAILABLE" | "PENDING" | "BLOCKED";

export type BusinessAccessContext = Readonly<{
  type: BusinessContextType;
  contextId: string;
  displayName: string;
  status: BusinessContextStatus;
  targetRoute: "/cabinet" | "/agent";
}>;

export type BusinessAccessResolution = Readonly<{
  contexts: readonly BusinessAccessContext[];
  preferredContext: BusinessAccessContext | null;
}>;

export type BusinessRouteDecision =
  | Readonly<{ kind: "ACCESS_STATE"; targetRoute: "/auth/business-access-state" }>
  | Readonly<{ kind: "SELECT_CONTEXT"; targetRoute: "/auth/select-context" }>
  | Readonly<{ kind: "ROUTE"; targetRoute: "/cabinet" | "/agent" }>;

export type CustomerAccessStatus = "AVAILABLE" | "NOT_ACTIVE" | "BLOCKED";
export type CustomerAccountStatus = "ACTIVE" | "IDENTITY_REVIEW_REQUIRED" | "SUSPENDED";
export type CustomerAccessBasis = "PURCHASE_BACKED" | "LEGACY_COMPATIBILITY" | "ROLLBACK_COMPATIBILITY";
export type CustomerAccessResolution = Readonly<{
  status: CustomerAccessStatus;
  accessBasis: CustomerAccessBasis | null;
  diagnosticCode: "CUSTOMER_ACCESS_PURCHASE_BACKED" | "CUSTOMER_ACCESS_LEGACY_COMPATIBILITY" | "CUSTOMER_ACCESS_ROLLBACK_COMPATIBILITY" | "CUSTOMER_ACCESS_NOT_ACTIVE" | "CUSTOMER_ACCESS_BLOCKED";
}>;
export type CustomerEntitlementEvidence = Readonly<{
  accountStatus: CustomerAccountStatus | null;
  purchaseBacked: boolean;
  legacyCompatible: boolean;
}>;
