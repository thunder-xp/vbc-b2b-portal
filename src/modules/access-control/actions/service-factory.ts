import { createClient } from "@/src/lib/supabase/server";
import { cache } from "react";
import {
  measurePerformanceStage,
  recordAuthCall,
} from "@/src/lib/performance/request-diagnostics";

import {
  SupabaseAccessRequestRepository,
  SupabaseCompanyMembershipRepository,
  SupabasePartnerCompanyRepository,
  SupabaseRolePermissionRepository,
  SupabaseUserProfileRepository,
} from "../repositories/supabase";
import type {
  AccessApprovalService,
  AccessRequestService,
  CompanyAccessService,
  PermissionService,
  UserProfileService,
} from "../services";
import { UnauthenticatedError } from "../services";
import {
  DefaultAccessRequestService,
  DefaultAccessApprovalService,
  DefaultCompanyAccessService,
  DefaultPermissionService,
  DefaultUserProfileService,
} from "../services/implementations";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export const getAuthenticatedUser = cache(async (): Promise<AuthenticatedUser> => {
  return measurePerformanceStage("authenticated", "auth", async () => {
    const supabase = await createClient();
    recordAuthCall();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user?.email) {
      throw new UnauthenticatedError();
    }

    return {
      id: data.user.id,
      email: data.user.email,
    };
  });
});

export async function getAuthenticatedUserId(): Promise<string> {
  const user = await getAuthenticatedUser();

  return user.id;
}

const userProfileService: UserProfileService = new DefaultUserProfileService(
  new SupabaseUserProfileRepository(),
);
const companyAccessService: CompanyAccessService = new DefaultCompanyAccessService(
  new SupabaseCompanyMembershipRepository(),
  new SupabasePartnerCompanyRepository(),
  userProfileService,
);
const permissionService: PermissionService = new DefaultPermissionService(
  new SupabaseRolePermissionRepository(),
  companyAccessService,
);

export function createUserProfileService(): UserProfileService {
  return userProfileService;
}

export function createAccessRequestService(): AccessRequestService {
  return new DefaultAccessRequestService(
    new SupabaseAccessRequestRepository(),
    createUserProfileService(),
  );
}

export function createAccessApprovalService(): AccessApprovalService {
  return new DefaultAccessApprovalService(
    new SupabaseAccessRequestRepository(),
    new SupabaseUserProfileRepository(),
    new SupabasePartnerCompanyRepository(),
    new SupabaseCompanyMembershipRepository(),
    new SupabaseRolePermissionRepository(),
  );
}

export function createCompanyAccessService(): CompanyAccessService {
  return companyAccessService;
}

export function createPermissionService(): PermissionService {
  return permissionService;
}
