import type { RetailMarketplaceRepository } from "../repositories/retail-marketplace.repository";
import type { InstallationAssignmentView } from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = new Set(["no_capacity", "schedule_conflict", "region_issue", "technical_scope", "other"]);
const PARTNER_EXECUTION_COMMANDS = new Set(["schedule", "start", "complete"]);
const ADMIN_EXECUTION_COMMANDS = new Set(["schedule", "start", "complete", "open_dispute", "resolve_dispute", "cancel"]);

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

  transitionPartner(input: { companyId: string; executionId: string; command: "schedule" | "start" | "complete"; expectedRevision: number; scheduledStartAt?: string | null; scheduledEndAt?: string | null; note?: string | null; idempotencyKey: string }) {
    validateExecutionInput(input, PARTNER_EXECUTION_COMMANDS);
    return this.repository.transitionPartnerExecution({ companyId: input.companyId, executionId: input.executionId, command: input.command, expectedRevision: input.expectedRevision, idempotencyKey: input.idempotencyKey, payload: executionPayload(input) });
  }

  transitionAdmin(input: { executionId: string; command: "schedule" | "start" | "complete" | "open_dispute" | "resolve_dispute" | "cancel"; expectedRevision: number; scheduledStartAt?: string | null; scheduledEndAt?: string | null; note?: string | null; idempotencyKey: string }) {
    validateExecutionInput(input, ADMIN_EXECUTION_COMMANDS);
    return this.repository.transitionAdminExecution({ executionId: input.executionId, command: input.command, expectedRevision: input.expectedRevision, idempotencyKey: input.idempotencyKey, payload: executionPayload(input) });
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
function validateExecutionInput(input: { executionId: string; command: string; expectedRevision: number; scheduledStartAt?: string | null; scheduledEndAt?: string | null; note?: string | null; idempotencyKey: string; companyId?: string }, commands: Set<string>) {
  if (!validId(input.executionId) || !validId(input.idempotencyKey) || (input.companyId !== undefined && !validId(input.companyId)) || !commands.has(input.command)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || (input.note?.trim().length ?? 0) > 500) throw new InstallationAssignmentInputError();
  if (input.command === "schedule") {
    const start = input.scheduledStartAt ? new Date(input.scheduledStartAt) : null;
    const end = input.scheduledEndAt ? new Date(input.scheduledEndAt) : null;
    if (!start || Number.isNaN(start.getTime()) || (end && (Number.isNaN(end.getTime()) || end <= start))) throw new InstallationAssignmentInputError();
  }
}
function executionPayload(input: { scheduledStartAt?: string | null; scheduledEndAt?: string | null; note?: string | null }) { return { scheduledStartAt: input.scheduledStartAt ?? null, scheduledEndAt: input.scheduledEndAt ?? null, note: input.note?.trim() || null }; }
