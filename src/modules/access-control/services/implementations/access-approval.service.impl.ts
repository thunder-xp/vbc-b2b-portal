import type {
  AccessRequestRepository,
  CompanyMembershipRepository,
  PartnerCompanyRepository,
  RolePermissionRepository,
  UserProfileRepository,
} from "../../repositories";
import {
  RepositoryOperationNotAvailableError,
  RepositoryUnexpectedError,
} from "../../repositories";
import {
  AccessRequestStatus,
  MembershipStatus,
  UserStatus,
  UserType,
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
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  OperationNotAvailableError,
} from "../errors";

const PARTNER_OWNER_ROLE_CODE = "partner_owner";

export class DefaultAccessApprovalService implements AccessApprovalService {
  constructor(
    private readonly accessRequestRepository: AccessRequestRepository,
    private readonly userProfileRepository: UserProfileRepository,
    private readonly partnerCompanyRepository: PartnerCompanyRepository,
    private readonly companyMembershipRepository: CompanyMembershipRepository,
    private readonly rolePermissionRepository: RolePermissionRepository,
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
    await this.ensureInternalReviewer(input.actorUserId);
    const request = await this.findRequest(input.requestId);

    if (request.status !== AccessRequestStatus.PendingReview) {
      throw new InvalidStateError("Only pending review requests can be approved.");
    }

    const requester = await this.findRequester(request.userId);

    if (!requester) {
      throw new NotFoundError("Requester profile was not found.");
    }

    const role = await this.rolePermissionRepository.findRoleByCode(
      PARTNER_OWNER_ROLE_CODE,
    );

    if (!role) {
      throw new NotFoundError("Partner owner role was not found.");
    }

    const company = await this.findOrCreateApprovedCompany({
      external1cId: input.external1cId,
      external1cContractId: input.external1cContractId,
      external1cPriceTypeId: input.external1cPriceTypeId,
      displayName: request.requestedCompanyName ?? input.external1cId,
    });
    const reviewedAt = new Date().toISOString();

    const activeMembership =
      await this.companyMembershipRepository.findActiveMembership(
        request.userId,
        company.id,
      );
    const membership =
      activeMembership ??
      (await this.companyMembershipRepository.create({
        userId: request.userId,
        companyId: company.id,
        roleId: role.id,
        status: MembershipStatus.Active,
        approvedBy: input.actorUserId,
        approvedAt: reviewedAt,
      }));

    const activatedRequester =
      await this.userProfileRepository.activatePartnerProfile(request.userId);
    const approvedRequest = await this.accessRequestRepository.updateStatus({
      id: request.id,
      status: AccessRequestStatus.Approved,
      companyId: company.id,
      requestedExternal1cId: input.external1cId,
      reviewedBy: input.actorUserId,
      reviewedAt,
      decisionReason: input.decisionReason ?? null,
    });

    return {
      request: approvedRequest,
      company,
      membership,
      requester: activatedRequester,
    };
  }

  async rejectAccessRequest(
    input: RejectAccessRequestInput,
  ): Promise<AccessRequest> {
    await this.ensureInternalReviewer(input.actorUserId);
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

    if (
      profile.status !== UserStatus.Active ||
      (profile.userType !== UserType.Internal && profile.userType !== UserType.Admin)
    ) {
      throw new ForbiddenError("Internal approval access is required.");
    }

    return profile;
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

  private async findOrCreateApprovedCompany(input: {
    external1cId: string;
    external1cContractId: string;
    external1cPriceTypeId: string;
    displayName: string;
  }) {
    try {
      const existingCompany =
        await this.partnerCompanyRepository.findByExternal1cId(
          input.external1cId,
        );

      if (existingCompany) {
        return this.partnerCompanyRepository.updateApprovalBinding({
          companyId: existingCompany.id,
          external1cContractId: input.external1cContractId,
          external1cPriceTypeId: input.external1cPriceTypeId,
          displayName: input.displayName,
        });
      }

      return this.partnerCompanyRepository.create({
        external1cId: input.external1cId,
        external1cContractId: input.external1cContractId,
        external1cPriceTypeId: input.external1cPriceTypeId,
        displayName: input.displayName,
      });
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
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
