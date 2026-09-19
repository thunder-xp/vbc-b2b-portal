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
