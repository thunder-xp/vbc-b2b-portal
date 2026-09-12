import "server-only";

import type { CompanyAccessService } from "@/src/modules/access-control/services";
import { MembershipStatus } from "@/src/modules/access-control/types";

import type { AccessRiskRepository } from "../repositories";
import type { AccessRiskMonitoringMode, AccessRiskTelemetryBatch } from "../types";
import { hashRiskDimension, type AccessRiskIdentity } from "./access-risk-identity";

const EVENT_NAME = /^[a-z][a-z0-9_]{2,79}$/;
const ROUTE_FAMILY = /^\/cabinet(?:\/[a-z0-9_-]+){0,4}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AccessRiskValidationError extends Error {
  constructor(readonly safeCode: string) { super(safeCode); this.name = "AccessRiskValidationError"; }
}

export class AccessRiskService {
  constructor(private readonly repository: AccessRiskRepository, private readonly companyAccess: CompanyAccessService) {}

  async recordTelemetry(userId: string, batch: AccessRiskTelemetryBatch, identity: AccessRiskIdentity): Promise<void> {
    validateBatch(batch);
    const memberships = await this.companyAccess.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    if (!membership) throw new AccessRiskValidationError("ACCESS_RISK_COMPANY_REQUIRED");
    await this.companyAccess.ensureActiveMembership(userId, membership.companyId);
    const productBuckets = uniqueBuckets(batch.events.map((event) => event.productId), "product");
    const categoryBuckets = uniqueBuckets(batch.events.map((event) => event.categoryId), "category");
    await this.repository.recordTelemetry({
      batchId: batch.batchId, companyId: membership.companyId, userId,
      sessionBuckets: identity.sessionBuckets, deviceBuckets: identity.deviceBuckets,
      networkBuckets: identity.networkBuckets, sessionHash: identity.sessionHash,
      deviceHash: identity.deviceHash, networkHash: identity.networkHash,
      countryCode: identity.countryCode, regionCode: identity.regionCode,
      productBuckets, categoryBuckets, events: batch.events,
    });
  }

  getOverview(input: Parameters<AccessRiskRepository["getOverview"]>[0]) { return this.repository.getOverview(input); }
  getCompany(companyId: string, before?: string) {
    if (!UUID.test(companyId) || (before && Number.isNaN(Date.parse(before)))) throw new AccessRiskValidationError("ACCESS_RISK_FILTER_INVALID");
    return this.repository.getCompany(companyId, before, 50);
  }
  evaluate(companyLimit = 1000) { return this.repository.evaluate(companyLimit); }
  setMonitoring(input: { companyId: string; mode: AccessRiskMonitoringMode; durationDays: 7 | 14 | 30; reason?: string }) {
    if (!UUID.test(input.companyId) || ![7, 14, 30].includes(input.durationDays) || (input.reason && (input.reason.trim().length < 3 || input.reason.length > 500))) {
      throw new AccessRiskValidationError("ACCESS_RISK_MONITORING_INVALID");
    }
    return this.repository.setMonitoring({ ...input, reason: input.reason?.trim() || undefined });
  }
}

function validateBatch(batch: AccessRiskTelemetryBatch): void {
  if (!UUID.test(batch.batchId) || !Array.isArray(batch.events) || batch.events.length < 1 || batch.events.length > 20) {
    throw new AccessRiskValidationError("ACCESS_RISK_BATCH_INVALID");
  }
  for (const event of batch.events) {
    if (!EVENT_NAME.test(event.eventName) || !ROUTE_FAMILY.test(event.routeFamily)
      || Number.isNaN(Date.parse(event.occurredAt))
      || (event.productId !== undefined && !UUID.test(event.productId))
      || (event.categoryId !== undefined && !UUID.test(event.categoryId))) {
      throw new AccessRiskValidationError("ACCESS_RISK_EVENT_INVALID");
    }
  }
}

function uniqueBuckets(values: Array<string | undefined>, namespace: "product" | "category"): number[] {
  return [...new Set(values.flatMap((value) => {
    return value ? hashRiskDimension(namespace, value) : [];
  }))];
}
