import type {
  BusinessAccessContext,
  BusinessAccessResolution,
  BusinessContextType,
  BusinessRouteDecision,
  CustomerAccessStatus,
  CustomerAccountStatus,
} from "./types";

export interface BusinessAccessRepository {
  resolveOwn(authUserId: string): Promise<BusinessAccessResolution>;
  selectOwn(type: BusinessContextType, contextId: string): Promise<BusinessAccessContext>;
}
export interface CustomerAccessRepository {
  findOwnAccountStatus(authUserId: string): Promise<CustomerAccountStatus | null>;
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
  constructor(private readonly repository: CustomerAccessRepository) {}

  async resolve(authUserId: string): Promise<CustomerAccessStatus> {
    const status = await this.repository.findOwnAccountStatus(authUserId);
    if (status === "ACTIVE") return "AVAILABLE";
    if (status === null) return "NOT_ACTIVE";
    return "BLOCKED";
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

function sameContext(left: BusinessAccessContext, right: BusinessAccessContext) {
  return left.type === right.type && left.contextId === right.contextId;
}
