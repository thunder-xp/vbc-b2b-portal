import "server-only";

import type { CompanyAccessService } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { BehaviorAnalyticsRepository } from "../repositories";
import {
  BEHAVIOR_EVENT_NAMES,
  type BehaviorAnalyticsPreview,
  type RecordBehaviorEventInput,
} from "../types";

const EVENT_NAMES = new Set<string>(BEHAVIOR_EVENT_NAMES);
const FORBIDDEN_METADATA_KEY =
  /(price|amount|token|secret|password|email|authorization|note|comment)/i;

export class BehaviorAnalyticsValidationError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
    this.name = "BehaviorAnalyticsValidationError";
  }
}

export class BehaviorAnalyticsService {
  constructor(
    private readonly repository: BehaviorAnalyticsRepository,
    private readonly companyAccessService: CompanyAccessService,
  ) {}

  async record(
    userId: string,
    input: RecordBehaviorEventInput,
  ): Promise<string> {
    validateInput(input);
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find(
      (candidate) => candidate.status === MembershipStatus.Active,
    );
    if (!membership) {
      throw new BehaviorAnalyticsValidationError("ANALYTICS_COMPANY_REQUIRED");
    }
    await this.companyAccessService.getActiveCompanyContext(
      userId,
      membership.companyId,
    );
    return this.repository.record(membership.companyId, {
      ...input,
      route: normalizeRoute(input.route),
      searchQuery: normalizeSearch(input.searchQuery),
      sourceSurface: input.sourceSurface?.trim().slice(0, 50) || undefined,
      metadataSafe: input.metadataSafe ?? {},
    });
  }

  getAdminPreview(days = 30, limit = 10): Promise<BehaviorAnalyticsPreview> {
    return this.repository.getAdminPreview(
      Number.isInteger(days) && days >= 1 && days <= 90 ? days : 30,
      Number.isInteger(limit) && limit >= 1 && limit <= 25 ? limit : 10,
    );
  }
}

function validateInput(input: RecordBehaviorEventInput): void {
  if (
    !EVENT_NAMES.has(input.eventName) ||
    !isUuid(input.sessionId) ||
    [input.productId, input.categoryId, input.brandId]
      .filter((value): value is string => Boolean(value))
      .some((value) => !isUuid(value)) ||
    (input.resultCount !== undefined
      && (!Number.isInteger(input.resultCount) || input.resultCount < 0)) ||
    (input.quantity !== undefined
      && (!Number.isFinite(input.quantity) || input.quantity <= 0)) ||
    Object.keys(input.metadataSafe ?? {}).some((key) =>
      FORBIDDEN_METADATA_KEY.test(key)
    ) ||
    JSON.stringify(input.metadataSafe ?? {}).length > 1800
  ) {
    throw new BehaviorAnalyticsValidationError("ANALYTICS_EVENT_INVALID");
  }
}

function normalizeRoute(route: string): string {
  const normalized = route.trim().split("?")[0].slice(0, 200);
  if (normalized !== "/cabinet" && !normalized.startsWith("/cabinet/")) {
    throw new BehaviorAnalyticsValidationError("ANALYTICS_ROUTE_INVALID");
  }
  return normalized;
}

function normalizeSearch(value: string | undefined): string | undefined {
  return value?.trim().toLocaleLowerCase().replace(/\s+/g, " ").slice(0, 100)
    || undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value);
}
