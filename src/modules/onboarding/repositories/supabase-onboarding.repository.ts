import "server-only";

import { z } from "zod";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type {
  OnboardingCompanyVerificationContext,
  OnboardingDetailRecord,
  OnboardingApprovalResult,
  OnboardingHealth,
  OnboardingQueue,
  OnboardingStatus,
  PartnerOnboardingStatusCenter,
} from "../types";
import type {
  OnboardingQueueInput,
  OnboardingRepository,
  ApproveOnboardingInput,
  ClarificationInput,
  PartnerRevisionInput,
  RejectionInput,
  SaveOnboardingApprovalDraftInput,
  DirectoryRefreshEventInput,
  MarkWaitingForOneCInput,
} from "./onboarding.repository";

const queueSchema = z.object({
  rows: z.array(z.object({
    id: z.string().uuid(),
    onboarding_status: z.string(),
    created_at: z.string(),
    company_name: z.string(),
    fiscal_code: z.string().nullable(),
    contact_name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    assigned_manager_user_id: z.string().uuid().nullable(),
    assigned_manager: z.string().nullable(),
    match_state: z.string(),
    sla_state: z.string(),
    duplicate_fiscal_code: z.boolean(),
    next_action: z.string(),
    revision_count: z.number(),
    assignment_age_seconds: z.number().nullable(),
    clarification_age_seconds: z.number().nullable(),
    partner_response_overdue: z.boolean(),
    sla_paused: z.boolean(),
  })),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  statusCounters: z.record(z.string(), z.number()),
  slaCounters: z.object({
    newToday: z.number(),
    waitingOverFourHours: z.number(),
    waitingOverOneDay: z.number(),
    awaitingPartnerResponse: z.number(),
    awaitingOneCCompany: z.number(),
    readyForApproval: z.number(),
    unassigned: z.number(),
  }),
  managers: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    workloadCount: z.number(),
  })),
  directoryFreshness: z.object({
    status: z.string(),
    synchronizedAt: z.string().nullable(),
    stale: z.boolean(),
  }).nullable(),
});

const detailSchema = z.object({
  request: z.object({
    id: z.string().uuid(),
    status: z.string(),
    createdAt: z.string(),
    lastActivityAt: z.string(),
    assignedManager: z.string().nullable(),
    reviewStartedAt: z.string().nullable(),
    initialAccessProfile: z.string().nullable(),
  }),
  revision: z.object({
    revisionNumber: z.number(),
    companyName: z.string(),
    fiscalCode: z.string().nullable(),
    contactName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    message: z.string().nullable(),
    locality: z.string().nullable(),
    businessType: z.string().nullable(),
    businessActivity: z.string().nullable(),
    estimatedPurchasingVolume: z.string().nullable(),
    submittedAt: z.string(),
  }),
  sla: z.object({
    firstReviewDue: z.string(),
    finalDecisionDue: z.string(),
    paused: z.boolean(),
  }),
  events: z.array(z.object({
    event: z.string(),
    previousStatus: z.string().nullable(),
    nextStatus: z.string().nullable(),
    occurredAt: z.string(),
    actor: z.string().nullable(),
  })),
  candidates: z.array(z.object({
    id: z.string().uuid(),
    external1cId: z.string(),
    externalCode: z.string().nullable(),
    companyName: z.string(),
    fiscalCode: z.string().nullable(),
    active: z.boolean(),
    locality: z.string().nullable(),
    assignedManager: z.string().nullable(),
    contractCount: z.number(),
    priceProfileCount: z.number(),
    portalLinkageState: z.string(),
    synchronizedAt: z.string(),
    matchReason: z.string(),
    published: z.boolean(),
    fiscalCodeState: z.enum(["valid", "missing", "malformed"]),
    contracts: z.array(z.object({
      name: z.string(),
      code: z.string().nullable(),
    })),
    priceProfiles: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      code: z.string().nullable(),
    })),
  })),
  duplicates: z.object({
    sameFiscalCode: z.boolean(),
    sameEmail: z.boolean(),
    existingMembership: z.boolean(),
    userLinkedToAnotherCompany: z.boolean(),
  }),
  managers: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    workloadCount: z.number().optional().default(0),
  })),
  directoryFiscalMatchCount: z.number().int().nonnegative(),
  draft: z.object({
    requestRevisionNumber: z.number().int().positive(),
    confirmedCounterpartyId: z.string().uuid().nullable(),
    assignedManagerId: z.string().uuid().nullable(),
    selectedPriceProfileId: z.string().uuid().nullable(),
    paymentModel: z.string().nullable(),
    initialBusinessProfile: z.string().nullable(),
    financeAccess: z.boolean(),
    orderAccess: z.boolean(),
    currentStep: z.number().int().min(1).max(4),
    version: z.number().int().positive(),
    attemptKey: z.string().uuid(),
    updatedAt: z.string(),
    stale: z.boolean(),
  }).nullable(),
  workflow: z.object({
    clarification: z.object({
      reasonCategory: z.string(),
      partnerMessage: z.string(),
      fields: z.array(z.string()),
      responseDeadline: z.string().nullable(),
      internalNote: z.string().nullable(),
      requestedAt: z.string().nullable(),
      responseOverdue: z.boolean(),
    }).nullable(),
    rejection: z.object({
      reasonCategory: z.string(),
      partnerMessage: z.string(),
      internalNote: z.string().nullable(),
    }).nullable(),
    assignedManagerId: z.string().uuid().nullable(),
    assignmentAgeSeconds: z.number().nullable(),
    revisionCount: z.number(),
    reopenedCount: z.number(),
    managerWorkload: z.number(),
    isPlatformAdmin: z.boolean(),
  }),
});

const companyVerificationContextSchema = z.object({
  latestStatus: z.string().nullable(),
  latestStartedAt: z.string().nullable(),
  latestFinishedAt: z.string().nullable(),
  latestSafeErrorCode: z.string().nullable(),
  lastSuccessfulAt: z.string().nullable(),
  waitingSince: z.string().nullable(),
  waitingInternalNote: z.string().nullable(),
});

const partnerStatusCenterSchema = z.object({
  status: z.string(),
  companyName: z.string(),
  revisionNumber: z.number(),
  revisionSubmittedAt: z.string(),
  currentValues: z.object({
    companyName: z.string(),
    fiscalCode: z.string().nullable(),
    contactName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    locality: z.string().nullable(),
    businessType: z.string().nullable(),
    businessActivity: z.string().nullable(),
    estimatedPurchasingVolume: z.string().nullable(),
    comment: z.string().nullable(),
  }),
  partnerMessage: z.string().nullable(),
  requestedFields: z.array(z.string()),
  responseDeadline: z.string().nullable(),
  canUpdate: z.boolean(),
  canCancel: z.boolean(),
  hasActiveMembership: z.boolean(),
  timeline: z.array(z.object({
    event: z.string(),
    status: z.string().nullable(),
    occurredAt: z.string(),
  })),
});

const approvalResultSchema = z.object({
  success: z.boolean(),
  idempotent: z.boolean().optional(),
  companyBranch: z.enum(["created", "reused"]).optional(),
  membershipOutcome: z.enum(["created", "reused"]).optional(),
  failureCode: z.string().optional(),
  correlationId: z.string().uuid().optional(),
  failingStage: z.string().max(80).optional(),
  sqlState: z.string().regex(/^[0-9A-Z]{5}$/).optional(),
  safeError: z.string().max(300).optional(),
});

const healthSchema = z.object({
  allowed: z.boolean(),
  directory: z.object({
    sync_id: z.string().uuid(),
    status: z.string(),
    started_at: z.string(),
    finished_at: z.string().nullable(),
    source_counterparties: z.number(),
    published_counterparties: z.number(),
    duplicate_fiscal_codes: z.number(),
    failed_records: z.number(),
    unresolved_manager_references: z.number(),
    safe_error_code: z.string().nullable(),
    lock_acquired_at: z.string().nullable(),
    fetched_counterparties: z.number(),
    staged_counterparties: z.number(),
    skipped_counterparties: z.number(),
    without_fiscal_code: z.number(),
    malformed_fiscal_codes: z.number(),
    normalized_fiscal_codes_changed: z.number(),
    duplicate_counterparty_rows: z.number(),
    pages_processed: z.number(),
    duration_ms: z.number(),
  }).nullable().optional(),
  queue: z.object({
    new: z.number(),
    unassigned: z.number(),
    overdue: z.number(),
    matchConflicts: z.number(),
    awaitingOneCCompany: z.number(),
  }).optional(),
});

export class SupabaseOnboardingRepository implements OnboardingRepository {
  async listQueue(input: OnboardingQueueInput): Promise<OnboardingQueue> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_onboarding_queue_v2", {
      p_page: input.page,
      p_page_size: input.pageSize,
      p_status: input.status,
      p_assigned_manager: input.assignedManager,
      p_unassigned: input.unassigned,
      p_sla: input.sla,
      p_match_state: input.matchState,
      p_search: input.search,
      p_locality: input.locality,
      p_business_type: input.businessType,
      p_submitted_from: input.submittedFrom,
      p_submitted_to: input.submittedTo,
    });
    if (error) throw repositoryError("get_onboarding_queue_v2", error);
    return queueSchema.parse(data) as OnboardingQueue;
  }

  async getDetail(requestId: string): Promise<OnboardingDetailRecord | null> {
    const client = await createClient();
    const [detailResult, contextResult] = await Promise.all([
      client.rpc("get_onboarding_request_detail_v4", { p_request_id: requestId }),
      client.rpc("get_onboarding_company_verification_context", { p_request_id: requestId }),
    ]);
    if (detailResult.error) {
      throw repositoryError("get_onboarding_request_detail_v4", detailResult.error);
    }
    if (contextResult.error) {
      throw repositoryError(
        "get_onboarding_company_verification_context",
        contextResult.error,
      );
    }
    if (detailResult.data === null || contextResult.data === null) return null;
    return {
      ...detailSchema.parse(detailResult.data),
      companyVerificationContext: companyVerificationContextSchema.parse(
        contextResult.data,
      ) as OnboardingCompanyVerificationContext,
    } as OnboardingDetailRecord;
  }

  async getHealth(): Promise<OnboardingHealth> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_onboarding_health");
    if (error) throw repositoryError("get_onboarding_health", error);
    return healthSchema.parse(data) as OnboardingHealth;
  }

  async assign(requestId: string, assigneeUserId: string): Promise<void> {
    const client = await createClient();
    const { error } = await client.rpc("assign_onboarding_request", {
      p_request_id: requestId,
      p_assignee_user_id: assigneeUserId,
    });
    if (error) throw repositoryError("assign_onboarding_request", error);
  }

  async unassign(requestId: string): Promise<void> {
    const client = await createClient();
    const { error } = await client.rpc("unassign_onboarding_request", {
      p_request_id: requestId,
    });
    if (error) throw repositoryError("unassign_onboarding_request", error);
  }

  async transition(
    requestId: string,
    nextStatus: OnboardingStatus,
    reason: string | null,
  ): Promise<void> {
    const client = await createClient();
    const { error } = await client.rpc("transition_onboarding_request", {
      p_request_id: requestId,
      p_next_status: nextStatus,
      p_reason: reason,
    });
    if (error) throw repositoryError("transition_onboarding_request", error);
  }

  async confirmMatch(
    requestId: string,
    counterpartyId: string,
    initialAccessProfile: string,
  ): Promise<void> {
    const client = await createClient();
    const { error } = await client.rpc("confirm_onboarding_counterparty_match", {
      p_request_id: requestId,
      p_counterparty_id: counterpartyId,
      p_initial_access_profile: initialAccessProfile,
    });
    if (error) throw repositoryError("confirm_onboarding_counterparty_match", error);
  }

  async saveApprovalDraft(input: SaveOnboardingApprovalDraftInput): Promise<void> {
    const client = await createClient();
    const { error } = await client.rpc("save_onboarding_approval_draft", {
      p_request_id: input.requestId,
      p_expected_request_revision: input.expectedRequestRevision,
      p_expected_draft_version: input.expectedDraftVersion,
      p_step: input.step,
      p_counterparty_id: input.counterpartyId ?? null,
      p_assigned_manager_id: input.assignedManagerId ?? null,
      p_price_profile_id: input.priceProfileId ?? null,
      p_payment_model: input.paymentModel ?? null,
      p_initial_profile: input.initialProfile ?? null,
      p_finance_access: input.financeAccess ?? false,
      p_order_access: input.orderAccess ?? true,
    });
    if (error) throw repositoryError("save_onboarding_approval_draft", error);
  }

  async setApprovalDraftStep(
    requestId: string,
    expectedDraftVersion: number,
    step: number,
  ): Promise<void> {
    const client = await createClient();
    const { error } = await client.rpc("set_onboarding_approval_draft_step", {
      p_request_id: requestId,
      p_expected_draft_version: expectedDraftVersion,
      p_step: step,
    });
    if (error) throw repositoryError("set_onboarding_approval_draft_step", error);
  }

  async resetApprovalDraft(requestId: string): Promise<void> {
    const client = await createClient();
    const { error } = await client.rpc("reset_onboarding_approval_draft", {
      p_request_id: requestId,
    });
    if (error) throw repositoryError("reset_onboarding_approval_draft", error);
  }

  async approve(input: ApproveOnboardingInput): Promise<OnboardingApprovalResult> {
    const client = await createClient();
    const { data, error } = await client.rpc("approve_partner_access_request_v3", {
      p_request_id: input.requestId,
      p_expected_request_revision: input.expectedRequestRevision,
      p_expected_draft_version: input.expectedDraftVersion,
      p_attempt_key: input.attemptKey,
      p_correlation_id: input.correlationId,
    });
    if (error) throw repositoryError("approve_partner_access_request_v3", error);
    return approvalResultSchema.parse(data);
  }

  async requestClarification(input: ClarificationInput): Promise<void> {
    await this.call("request_onboarding_clarification", {
      p_request_id: input.requestId,
      p_expected_revision: input.expectedRevision,
      p_reason_category: input.reasonCategory,
      p_partner_message: input.partnerMessage,
      p_fields: input.fields,
      p_response_deadline: input.responseDeadline,
      p_internal_note: input.internalNote,
    });
  }

  async reject(input: RejectionInput): Promise<void> {
    await this.call("reject_onboarding_request", {
      p_request_id: input.requestId,
      p_expected_revision: input.expectedRevision,
      p_reason_category: input.reasonCategory,
      p_partner_message: input.partnerMessage,
      p_internal_note: input.internalNote,
    });
  }

  async cancelOwn(): Promise<void> {
    await this.call("cancel_own_onboarding_request", {});
  }

  async cancelInternal(requestId: string, reason: string, note: string): Promise<void> {
    await this.call("cancel_onboarding_request_internal", {
      p_request_id: requestId,
      p_reason_category: reason,
      p_internal_note: note,
    });
  }

  async reopen(requestId: string, assigneeUserId: string, reason: string): Promise<void> {
    await this.call("reopen_onboarding_request", {
      p_request_id: requestId,
      p_assignee_user_id: assigneeUserId,
      p_reason: reason,
    });
  }

  async submitPartnerRevision(input: PartnerRevisionInput): Promise<number> {
    const data = await this.call("submit_onboarding_partner_revision", {
      p_expected_revision: input.expectedRevision,
      p_company_name: input.companyName,
      p_fiscal_code: input.fiscalCode,
      p_contact_name: input.contactName,
      p_phone: input.phone,
      p_email: input.email,
      p_locality: input.locality,
      p_business_type: input.businessType,
      p_business_activity: input.businessActivity,
      p_estimated_purchasing_volume: input.estimatedPurchasingVolume,
      p_comment: input.comment,
    });
    return z.number().int().positive().parse(data);
  }

  async getOwnStatusCenter(): Promise<PartnerOnboardingStatusCenter | null> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_own_onboarding_status_center");
    if (error) throw repositoryError("get_own_onboarding_status_center", error);
    return data === null
      ? null
      : partnerStatusCenterSchema.parse(data) as PartnerOnboardingStatusCenter;
  }

  async recordDirectoryRefreshEvent(input: DirectoryRefreshEventInput): Promise<void> {
    await this.call("record_onboarding_directory_refresh_event", {
      p_request_id: input.requestId,
      p_event_type: input.eventType,
      p_correlation_id: input.correlationId,
      p_safe_error_code: input.safeErrorCode ?? null,
    });
  }

  async markWaitingForOneCCounterparty(input: MarkWaitingForOneCInput): Promise<void> {
    await this.call("mark_onboarding_waiting_for_1c_counterparty", {
      p_request_id: input.requestId,
      p_assignee_user_id: input.assigneeUserId,
      p_internal_note: input.internalNote,
      p_correlation_id: input.correlationId,
    });
  }

  private async call(operation: string, input: Record<string, unknown>): Promise<unknown> {
    const client = await createClient();
    const { data, error } = await client.rpc(operation, input);
    if (error) throw repositoryError(operation, error);
    return data;
  }
}

function repositoryError(operation: string, cause: unknown): RepositoryUnexpectedError {
  return new RepositoryUnexpectedError({
    operation,
    table: "access_requests",
    payloadKeys: [],
    cause,
  });
}
