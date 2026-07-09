"use server";

import type { CompanyMembership, MembershipStatus } from "../types";
import {
  type ActionResult,
  failureFromError,
  success,
} from "./action-result";
import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "./service-factory";

export type OwnMembershipDto = {
  id: string;
  companyId: string;
  roleId: string;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
};

export async function getOwnMembershipsAction(): Promise<
  ActionResult<OwnMembershipDto[]>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const memberships = await createCompanyAccessService().getOwnMemberships(userId);

    return success("Memberships loaded.", memberships.map(toOwnMembershipDto));
  } catch (error) {
    return failureFromError(error);
  }
}

function toOwnMembershipDto(membership: CompanyMembership): OwnMembershipDto {
  return {
    id: membership.id,
    companyId: membership.companyId,
    roleId: membership.roleId,
    status: membership.status,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}
