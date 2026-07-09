"use server";

import type {
  CompanyMembership,
  PartnerCompany,
  UserProfile,
} from "../types";
import {
  type ActionResult,
  failureFromError,
  invalidInput,
  success,
} from "./action-result";
import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "./service-factory";

export type ActiveCompanyContextDto = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    phone: string | null;
    status: UserProfile["status"];
  };
  company: {
    id: string;
    external1cId: string;
    displayName: string;
    status: PartnerCompany["status"];
  };
  membership: {
    id: string;
    companyId: string;
    roleId: string;
    status: CompanyMembership["status"];
  };
};

export async function getActiveCompanyContextAction(
  companyId: string,
): Promise<ActionResult<ActiveCompanyContextDto>> {
  try {
    const normalizedCompanyId = companyId.trim();

    if (!normalizedCompanyId) {
      return invalidInput("Company context is required.");
    }

    const userId = await getAuthenticatedUserId();
    const context = await createCompanyAccessService().getActiveCompanyContext(
      userId,
      normalizedCompanyId,
    );

    return success("Active company context loaded.", {
      user: {
        id: context.user.id,
        email: context.user.email,
        fullName: context.user.fullName,
        phone: context.user.phone,
        status: context.user.status,
      },
      company: {
        id: context.company.id,
        external1cId: context.company.external1cId,
        displayName: context.company.displayName,
        status: context.company.status,
      },
      membership: {
        id: context.membership.id,
        companyId: context.membership.companyId,
        roleId: context.membership.roleId,
        status: context.membership.status,
      },
    });
  } catch (error) {
    return failureFromError(error);
  }
}
