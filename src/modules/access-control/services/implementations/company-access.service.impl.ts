import type {
  CompanyMembershipRepository,
  PartnerCompanyRepository,
} from "../../repositories";
import {
  RepositoryOperationNotAvailableError,
  RepositoryUnexpectedError,
} from "../../repositories";
import {
  CompanyStatus,
  MembershipStatus,
  type CompanyMembership,
  type PartnerCompany,
} from "../../types";
import type {
  ActiveCompanyContext,
  CompanyAccessService,
  CompanyAccessValidationResult,
} from "../company-access.service";
import type { UserProfileService } from "../user-profile.service";
import {
  AccessControlError,
  ForbiddenError,
  InvalidStateError,
  MembershipRequiredError,
  NotFoundError,
  OperationNotAvailableError,
} from "../errors";

export class DefaultCompanyAccessService implements CompanyAccessService {
  constructor(
    private readonly companyMembershipRepository: CompanyMembershipRepository,
    private readonly partnerCompanyRepository: PartnerCompanyRepository,
    private readonly userProfileService: UserProfileService,
  ) {}

  async getOwnMemberships(userId: string): Promise<CompanyMembership[]> {
    try {
      return await this.companyMembershipRepository.findByUserId(userId);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async getActiveCompanyContext(
    userId: string,
    companyId: string,
  ): Promise<ActiveCompanyContext> {
    const user = await this.userProfileService.ensureActiveUser(userId);
    const membership = await this.ensureActiveMembership(userId, companyId);
    const company = await this.ensureActiveCompany(companyId);

    return {
      user,
      company,
      membership,
    };
  }

  async validateCompanyAccess(
    userId: string,
    companyId: string,
  ): Promise<CompanyAccessValidationResult> {
    try {
      return {
        isAllowed: true,
        context: await this.getActiveCompanyContext(userId, companyId),
      };
    } catch (error) {
      if (this.isAccessDenialError(error)) {
        return {
          isAllowed: false,
          context: null,
        };
      }

      throw error;
    }
  }

  async ensureActiveMembership(
    userId: string,
    companyId: string,
  ): Promise<CompanyMembership> {
    const memberships = await this.getOwnMemberships(userId);
    const membership = memberships.find(
      (item) => item.companyId === companyId,
    );

    if (!membership) {
      throw new MembershipRequiredError();
    }

    if (
      membership.status === MembershipStatus.Suspended ||
      membership.status === MembershipStatus.Revoked ||
      membership.status === MembershipStatus.Rejected
    ) {
      throw new ForbiddenError("Company membership is not allowed.");
    }

    if (membership.status !== MembershipStatus.Active) {
      throw new InvalidStateError("Company membership is not active.");
    }

    return membership;
  }

  private async ensureActiveCompany(
    companyId: string,
  ): Promise<PartnerCompany> {
    let company: PartnerCompany | null;

    try {
      company = await this.partnerCompanyRepository.findById(companyId);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }

    if (!company) {
      throw new NotFoundError("Partner company was not found.");
    }

    if (
      company.status === CompanyStatus.Suspended ||
      company.status === CompanyStatus.Revoked ||
      company.status === CompanyStatus.Rejected
    ) {
      throw new ForbiddenError("Partner company is not allowed.");
    }

    if (company.status !== CompanyStatus.Active) {
      throw new InvalidStateError("Partner company is not active.");
    }

    return company;
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

  private isAccessDenialError(error: unknown): boolean {
    return (
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof InvalidStateError ||
      error instanceof MembershipRequiredError
    );
  }
}
