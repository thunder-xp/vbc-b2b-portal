import type {
  BusinessAccessContext,
  BusinessAccessResolution,
  BusinessContextType,
  BusinessRouteDecision,
  CustomerAccessResolution,
  CustomerEntitlementEvidence,
} from "./types";

export interface BusinessAccessRepository {
  resolveOwn(authUserId: string): Promise<BusinessAccessResolution>;
  selectOwn(type: BusinessContextType, contextId: string): Promise<BusinessAccessContext>;
}
export interface CustomerAccessRepository {
  resolveEntitlement(authUserId: string): Promise<CustomerEntitlementEvidence>;
}

export class BusinessAccessResolver {
  constructor(private readonly repository: BusinessAccessRepository) {}

  resolve(authUserId: string) {
    return this.repository.resolveOwn(authUserId);
  }

  select(type: BusinessContextType, contextId: string) {
    return this.repository.selectOwn(type, contextId);
  }
}

export class CustomerAccessResolver {
  constructor(
    private readonly repository: CustomerAccessRepository,
    private readonly purchaseEntitlementEnforced = true,
  ) {}

  async resolve(authUserId: string): Promise<CustomerAccessResolution> {
    const evidence = await this.repository.resolveEntitlement(authUserId);
    if (evidence.accountStatus === null) {
      return { status: "NOT_ACTIVE", accessBasis: null, diagnosticCode: "CUSTOMER_ACCESS_NOT_ACTIVE" };
    }
    if (evidence.accountStatus !== "ACTIVE") {
      return { status: "BLOCKED", accessBasis: null, diagnosticCode: "CUSTOMER_ACCESS_BLOCKED" };
    }
    if (evidence.purchaseBacked) {
      return { status: "AVAILABLE", accessBasis: "PURCHASE_BACKED", diagnosticCode: "CUSTOMER_ACCESS_PURCHASE_BACKED" };
    }
    if (evidence.legacyCompatible) {
      return { status: "AVAILABLE", accessBasis: "LEGACY_COMPATIBILITY", diagnosticCode: "CUSTOMER_ACCESS_LEGACY_COMPATIBILITY" };
    }
    if (!this.purchaseEntitlementEnforced) {
      return { status: "AVAILABLE", accessBasis: "ROLLBACK_COMPATIBILITY", diagnosticCode: "CUSTOMER_ACCESS_ROLLBACK_COMPATIBILITY" };
    }
    return { status: "NOT_ACTIVE", accessBasis: null, diagnosticCode: "CUSTOMER_ACCESS_NOT_ACTIVE" };
  }
}

export function decideBusinessRoute(resolution: BusinessAccessResolution): BusinessRouteDecision {
  const available = resolution.contexts.filter((context) => context.status === "AVAILABLE");
  if (available.length === 0) {
    return { kind: "ACCESS_STATE", targetRoute: "/auth/business-access-state" };
  }
  if (available.length === 1) {
    return { kind: "ROUTE", targetRoute: available[0].targetRoute };
  }
  const preferred = resolution.preferredContext;
  if (preferred && available.some((context) => sameContext(context, preferred))) {
    return { kind: "ROUTE", targetRoute: preferred.targetRoute };
  }
  return { kind: "SELECT_CONTEXT", targetRoute: "/auth/select-context" };
}

export function decidePostSignInBusinessRoute(resolution: BusinessAccessResolution): BusinessRouteDecision {
  const operationalDecision = decideBusinessRoute(resolution);
  if (operationalDecision.kind !== "ACCESS_STATE") return operationalDecision;

  const pendingAgent = resolution.contexts.find(
    (context) => context.type === "AGENT" && context.status === "PENDING",
  );
  return pendingAgent
    ? { kind: "ROUTE", targetRoute: pendingAgent.targetRoute }
    : operationalDecision;
}

function sameContext(left: BusinessAccessContext, right: BusinessAccessContext) {
  return left.type === right.type && left.contextId === right.contextId;
}
