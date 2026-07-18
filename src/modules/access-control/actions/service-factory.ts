import { createClient } from "@/src/lib/supabase/server";
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
  UserProfileService,
} from "../services";
import { UnauthenticatedError } from "../services";
import {
  DefaultAccessRequestService,
  DefaultAccessApprovalService,
  DefaultCompanyAccessService,
  DefaultUserProfileService,
} from "../services/implementations";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
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
}

export async function getAuthenticatedUserId(): Promise<string> {
  const user = await getAuthenticatedUser();

  return user.id;
}

export function createUserProfileService(): UserProfileService {
  return new DefaultUserProfileService(new SupabaseUserProfileRepository());
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
  return new DefaultCompanyAccessService(
    new SupabaseCompanyMembershipRepository(),
    new SupabasePartnerCompanyRepository(),
    createUserProfileService(),
  );
}
