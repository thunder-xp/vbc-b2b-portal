import type { RetailMarketplaceRepository } from "../repositories/retail-marketplace.repository";
import type { InstallationAssignmentView } from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = new Set(["no_capacity", "schedule_conflict", "region_issue", "technical_scope", "other"]);

export class InstallationAssignmentInputError extends Error {
  constructor() { super("Invalid installation assignment input."); this.name = "InstallationAssignmentInputError"; }
}

export class InstallationAssignmentDispatcher {
  constructor(private readonly repository: RetailMarketplaceRepository) {}

  activatePilot(input: { retailOrderId: string; selectionMode: "customer_selected" | "automatic"; preferredProviderId?: string | null; regionCode: string; schedulingContext?: Record<string, unknown>; reason: string; idempotencyKey: string }) {
    const preferredProviderId = input.preferredProviderId ?? null;
    if (!validId(input.retailOrderId) || !validId(input.idempotencyKey) || !/^MD(?:-[A-Z0-9]{1,8})?$/.test(input.regionCode)
      || input.reason.trim().length < 10 || (input.selectionMode === "customer_selected") !== Boolean(preferredProviderId)
      || (preferredProviderId !== null && !validId(preferredProviderId))) throw new InstallationAssignmentInputError();
    return this.repository.activatePilot({ ...input, preferredProviderId, reason: input.reason.trim(), schedulingContext: input.schedulingContext ?? {} });
  }

  list(companyId: string, view: InstallationAssignmentView) {
    if (!validId(companyId) || !(["offers", "active", "completed"] as const).includes(view)) throw new InstallationAssignmentInputError();
    return this.repository.listPartnerAssignments(companyId, view);
  }

  respond(input: { companyId: string; attemptId: string; decision: "accept" | "decline"; reasonCode?: string | null; reasonText?: string | null; idempotencyKey: string }) {
    const reasonCode = input.reasonCode?.trim() || null;
    const reasonText = input.reasonText?.trim() || null;
    if (!validId(input.companyId) || !validId(input.attemptId) || !validId(input.idempotencyKey)
      || !(["accept", "decline"] as const).includes(input.decision) || (reasonCode !== null && !REASONS.has(reasonCode))
      || (reasonText?.length ?? 0) > 300) throw new InstallationAssignmentInputError();
    return this.repository.respondToAssignment({ ...input, reasonCode, reasonText });
  }

  reassign(input: { requirementId: string; providerId: string; expectedRevision: number; reason: string }) {
    if (!validId(input.requirementId) || !validId(input.providerId) || !Number.isSafeInteger(input.expectedRevision)
      || input.expectedRevision < 0 || input.reason.trim().length < 10) throw new InstallationAssignmentInputError();
    return this.repository.reassign({ ...input, reason: input.reason.trim() });
  }

  runWorker(limit = 50) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new InstallationAssignmentInputError();
    return this.repository.runAssignmentWorker(limit);
  }
}

function validId(value: string): boolean { return UUID.test(value) && value.toLowerCase() !== "00000000-0000-0000-0000-000000000000"; }
