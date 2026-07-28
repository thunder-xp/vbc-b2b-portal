import type {
  AccessApprovalTransactionRepository,
  AccessRequestRepository,
  UserProfileRepository,
} from "../../repositories";
import {
  RepositoryOperationNotAvailableError,
  RepositoryUnexpectedError,
} from "../../repositories";
import {
  AccessRequestStatus,
  type AccessRequest,
  type UserProfile,
} from "../../types";
import type {
  AccessApprovalService,
  AccessRequestReview,
  ApproveAccessRequestInput,
  ApprovedAccessRequestResult,
  RejectAccessRequestInput,
} from "../access-approval.service";
import {
  AccessControlError,
  ApprovalError,
  type ApprovalErrorCode,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  OperationNotAvailableError,
} from "../errors";
import { canApprovePartnerRequests } from "../internal-authorization";
import { randomUUID } from "node:crypto";

export class DefaultAccessApprovalService implements AccessApprovalService {
  constructor(
    private readonly accessRequestRepository: AccessRequestRepository,
    private readonly userProfileRepository: UserProfileRepository,
    private readonly approvalTransactionRepository: AccessApprovalTransactionRepository,
  ) {}

  async listPendingReviewRequests(
    actorUserId: string,
  ): Promise<AccessRequestReview[]> {
    await this.ensureInternalReviewer(actorUserId);

    try {
      const requests = await this.accessRequestRepository.findPendingReview();

      return Promise.all(
        requests.map(async (request) => ({
          request,
          requester: await this.findRequester(request.userId),
        })),
      );
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async getRequestForReview(
    actorUserId: string,
    requestId: string,
  ): Promise<AccessRequestReview> {
    await this.ensureInternalReviewer(actorUserId);
    const request = await this.findRequest(requestId);

    return {
      request,
      requester: await this.findRequester(request.userId),
    };
  }

  async approveAccessRequest(
    input: ApproveAccessRequestInput,
  ): Promise<ApprovedAccessRequestResult> {
    const startedAt = performance.now();
    const correlationId = input.correlationId ?? randomUUID();
    let stage = "authorization";

    console.info({
      event: "partner_access_approval_attempt",
      requestId: input.requestId,
      reviewerId: input.actorUserId,
      correlationId,
      stage,
      outcome: "started",
    });

    try {
      await this.ensureInternalReviewer(input.actorUserId);
      stage = "input_validation";
      const approvalBinding = this.normalizeApprovalBinding(input);
      stage = "request_validation";
      const request = await this.findRequest(input.requestId);

      if (
        request.status !== AccessRequestStatus.PendingReview &&
        request.status !== AccessRequestStatus.Approved
      ) {
        throw new InvalidStateError(
          "Only pending or approved requests can continue approval.",
        );
      }

      const requester = await this.findRequester(request.userId);

      if (!requester) {
        throw new NotFoundError("Requester profile was not found.");
      }

      stage = "approval_transaction";
      const result = await this.approvalTransactionRepository.approve({
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        ...approvalBinding,
        correlationId,
      });

      console.info({
        event: "partner_access_approval_completed",
        requestId: input.requestId,
        reviewerId: input.actorUserId,
        correlationId,
        stage,
        outcome: "succeeded",
        durationMs: Math.round(performance.now() - startedAt),
        companyBranch: result.companyBranch,
        companyId: result.company.id,
        membershipOutcome: result.membershipOutcome,
        idempotent: result.idempotent,
      });

      return result;
    } catch (error) {
      const approvalError = this.mapApprovalError(error, correlationId);
      console.error({
        event: "partner_access_approval_failed",
        requestId: input.requestId,
        reviewerId: input.actorUserId,
        correlationId,
        stage,
        outcome: "failed",
        safeErrorCode: approvalError.code,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw approvalError;
    }
  }

  async rejectAccessRequest(
    input: RejectAccessRequestInput,
  ): Promise<AccessRequest> {
    await this.ensureInternalReviewer(input.actorUserId);
    this.ensureRejectionReason(input.reason);
    const request = await this.findRequest(input.requestId);

    if (request.status !== AccessRequestStatus.PendingReview) {
      throw new InvalidStateError("Only pending review requests can be rejected.");
    }

    try {
      return await this.accessRequestRepository.updateStatus({
        id: request.id,
        status: AccessRequestStatus.Rejected,
        reviewedBy: input.actorUserId,
        reviewedAt: new Date().toISOString(),
        decisionReason: input.reason,
      });
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  private async ensureInternalReviewer(actorUserId: string): Promise<UserProfile> {
    const profile = await this.findRequester(actorUserId);

    if (!profile) {
      throw new NotFoundError("Reviewer profile was not found.");
    }

    if (!canApprovePartnerRequests(profile)) {
      throw new ForbiddenError("Internal approval access is required.");
    }

    return profile;
  }

  private normalizeApprovalBinding(input: ApproveAccessRequestInput): {
    external1cId: string;
    external1cCode: string | null;
    external1cContractId: string | null;
    external1cPriceTypeId: string;
    decisionReason: string | null;
  } {
    const external1cId = input.external1cId.trim();
    const external1cCode = input.external1cCode?.trim() || null;
    const external1cContractId = input.external1cContractId?.trim() || null;
    const external1cPriceTypeId = input.external1cPriceTypeId.trim();

    if (
      external1cId.length === 0 ||
      external1cPriceTypeId.length === 0
    ) {
      throw new InvalidStateError(
        "1C partner and price type references are required.",
      );
    }

    return {
      external1cId,
      external1cCode,
      external1cContractId,
      external1cPriceTypeId,
      decisionReason: input.decisionReason?.trim() || null,
    };
  }

  private ensureRejectionReason(reason: string): void {
    if (reason.trim().length === 0) {
      throw new InvalidStateError("Rejection reason is required.");
    }
  }

  private async findRequest(requestId: string): Promise<AccessRequest> {
    let request: AccessRequest | null;

    try {
      request = await this.accessRequestRepository.findById(requestId);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }

    if (!request) {
      throw new NotFoundError("Access request was not found.");
    }

    return request;
  }

  private async findRequester(userId: string): Promise<UserProfile | null> {
    try {
      return await this.userProfileRepository.findById(userId);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  private mapApprovalError(
    error: unknown,
    correlationId: string,
  ): ApprovalError {
    if (error instanceof ApprovalError) {
      return error;
    }

    if (error instanceof ForbiddenError) {
      return new ApprovalError("APPROVAL_PERMISSION_DENIED", correlationId);
    }

    if (error instanceof InvalidStateError) {
      return new ApprovalError("APPROVAL_REQUEST_NOT_PENDING", correlationId);
    }

    if (error instanceof NotFoundError) {
      return new ApprovalError("APPROVAL_REQUEST_NOT_FOUND", correlationId);
    }

    if (error instanceof RepositoryUnexpectedError) {
      const cause = error.cause as
        | { code?: string; message?: string }
        | undefined;
      const message = cause?.message ?? "";
      const knownCode = APPROVAL_ERROR_CODES.find((code) =>
        message.includes(code),
      );

      if (knownCode) {
        return new ApprovalError(knownCode, correlationId);
      }

      if (cause?.code === "42501") {
        return new ApprovalError("APPROVAL_PERMISSION_DENIED", correlationId);
      }

      if (
        cause?.code === "23502" ||
        cause?.code === "23503" ||
        cause?.code === "23505" ||
        cause?.code === "23514" ||
        cause?.code === "22023"
      ) {
        return new ApprovalError("APPROVAL_DATABASE_CONSTRAINT", correlationId);
      }
    }

    return new ApprovalError("APPROVAL_UNKNOWN_FAILURE", correlationId);
  }

  private mapRepositoryError(error: unknown): AccessControlError {
    if (error instanceof RepositoryOperationNotAvailableError) {
      return new OperationNotAvailableError(error.message);
    }

    if (error instanceof RepositoryUnexpectedError) {
      return new AccessControlError();
    }

    if (error instanceof AccessControlError) {
      return error;
    }

    return new AccessControlError();
  }
}

const APPROVAL_ERROR_CODES: ApprovalErrorCode[] = [
  "APPROVAL_REQUEST_NOT_FOUND",
  "APPROVAL_REQUEST_NOT_PENDING",
  "APPROVAL_FISCAL_CODE_REQUIRED",
  "APPROVAL_REQUESTER_INVALID",
  "APPROVAL_COMPANY_CONFLICT",
  "APPROVAL_MEMBERSHIP_CONFLICT",
  "APPROVAL_1C_BINDING_INVALID",
  "APPROVAL_ROLE_INVALID",
  "APPROVAL_PERMISSION_DENIED",
  "APPROVAL_DATABASE_CONSTRAINT",
  "APPROVAL_AUDIT_FAILURE",
  "APPROVAL_UNKNOWN_FAILURE",
];
