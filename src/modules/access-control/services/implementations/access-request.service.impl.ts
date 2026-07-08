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
    await this.ensureUserCanSubmitRequest(input.userId);

    const duplicateRequest = await this.findPendingDuplicate(input);

    if (duplicateRequest) {
      throw new DuplicateRequestError();
    }

    try {
      return await this.accessRequestRepository.create({
        userId: input.userId,
        companyId: input.companyId,
        requestedExternal1cId: input.requestedExternal1cId,
        requestedCompanyName: input.requestedCompanyName,
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

    if (request.status !== AccessRequestStatus.Pending) {
      throw new InvalidStateError("Only pending access requests can be cancelled.");
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

  private async ensureUserCanSubmitRequest(userId: string): Promise<void> {
    const profile = await this.userProfileService.getCurrentProfile(userId);

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
        companyId: input.companyId,
        requestedExternal1cId: input.requestedExternal1cId,
        requestedCompanyName: input.requestedCompanyName,
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
