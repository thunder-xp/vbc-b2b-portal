import type { AccessRequestRepository } from "../../repositories";
import {
  RepositoryOperationNotAvailableError,
  RepositoryUnexpectedError,
} from "../../repositories";
import {
  AccessRequestStatus,
  UserStatus,
  type AccessRequest,
} from "../../types";
import type {
  AccessRequestService,
  SubmitAccessRequestInput,
} from "../access-request.service";
import type { UserProfileService } from "../user-profile.service";
import {
  AccessControlError,
  DuplicateRequestError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  OperationNotAvailableError,
} from "../errors";

export class DefaultAccessRequestService implements AccessRequestService {
  constructor(
    private readonly accessRequestRepository: AccessRequestRepository,
    private readonly userProfileService: UserProfileService,
  ) {}

  async submitAccessRequest(
    input: SubmitAccessRequestInput,
  ): Promise<AccessRequest> {
    await this.ensureCanSubmitAccessRequest(input.userId);

    const duplicateRequest = await this.findPendingDuplicate(input);

    if (duplicateRequest) {
      throw new DuplicateRequestError();
    }

    try {
      return await this.accessRequestRepository.create({
        userId: input.userId,
        requestedCompanyName: input.requestedCompanyName,
        requestedFiscalCode: input.requestedFiscalCode,
        contactPhone: input.contactPhone,
        message: input.message,
      });
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async getOwnAccessRequests(userId: string): Promise<AccessRequest[]> {
    try {
      return await this.accessRequestRepository.findByUserId(userId);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async cancelOwnPendingRequest(
    userId: string,
    requestId: string,
  ): Promise<AccessRequest> {
    const request = await this.findRequestById(requestId);

    if (request.userId !== userId) {
      throw new ForbiddenError("Access request belongs to another user.");
    }

    if (request.status !== AccessRequestStatus.PendingReview) {
      throw new InvalidStateError(
        "Only pending review access requests can be cancelled.",
      );
    }

    try {
      return await this.accessRequestRepository.updateStatus({
        id: requestId,
        status: AccessRequestStatus.Cancelled,
      });
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  private async ensureCanSubmitAccessRequest(userId: string): Promise<void> {
    const profile = await this.userProfileService.getCurrentProfile(userId);

    console.info("[access-request-submit] service profile check", {
      permission: "CanSubmitAccessRequest",
      userId,
      profileFound: Boolean(profile),
      profileId: profile?.id ?? null,
      profileBelongsToAuthUser: profile?.id === userId,
      profileStatus: profile?.status ?? null,
    });

    if (!profile) {
      throw new NotFoundError("User profile was not found.");
    }

    if (
      profile.status === UserStatus.Suspended ||
      profile.status === UserStatus.Revoked ||
      profile.status === UserStatus.Rejected
    ) {
      throw new ForbiddenError("User profile cannot submit access requests.");
    }
  }

  private async findPendingDuplicate(
    input: SubmitAccessRequestInput,
  ): Promise<AccessRequest | null> {
    try {
      return await this.accessRequestRepository.findPendingDuplicate({
        userId: input.userId,
        requestedCompanyName: input.requestedCompanyName,
        requestedFiscalCode: input.requestedFiscalCode,
      });
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  private async findRequestById(requestId: string): Promise<AccessRequest> {
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

  private mapRepositoryError(error: unknown): AccessControlError {
    if (error instanceof RepositoryOperationNotAvailableError) {
      logAccessRequestServiceError("access_requests.repository_unavailable", error);
      return new OperationNotAvailableError(error.message);
    }

    if (error instanceof RepositoryUnexpectedError) {
      logAccessRequestServiceError("access_requests.repository_unexpected", error);
      return new AccessControlError();
    }

    if (error instanceof AccessControlError) {
      return error;
    }

    return new AccessControlError();
  }
}

function logAccessRequestServiceError(
  operation: string,
  error: RepositoryOperationNotAvailableError | RepositoryUnexpectedError,
) {
  const cause = error.cause;

  console.error("[access-request-submit] service wrapping repository error", {
    operation,
    repositoryOperation:
      error instanceof RepositoryUnexpectedError ? error.operation : undefined,
    table: error instanceof RepositoryUnexpectedError ? error.table : undefined,
    payloadKeys:
      error instanceof RepositoryUnexpectedError ? error.payloadKeys ?? [] : [],
    errorConstructor: error.constructor.name,
    errorName: error.name,
    errorMessage: error.message,
    causeConstructor: cause instanceof Error ? cause.constructor.name : null,
    causeName: cause instanceof Error ? cause.name : null,
    causeCode: getErrorField(cause, "code"),
    causeMessage: getErrorField(cause, "message"),
    causeDetails: getErrorField(cause, "details"),
    causeHint: getErrorField(cause, "hint"),
    causeStack: cause instanceof Error ? cause.stack : null,
    stack: error.stack,
  });
}

function getErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== "object" || !(field in error)) {
    return null;
  }

  return (error as Record<string, unknown>)[field];
}
