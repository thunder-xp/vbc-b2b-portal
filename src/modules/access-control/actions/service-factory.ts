import { createClient } from "@/src/lib/supabase/server";

import {
  SupabaseAccessRequestRepository,
  SupabaseCompanyMembershipRepository,
  SupabasePartnerCompanyRepository,
  SupabaseUserProfileRepository,
} from "../repositories/supabase";
import type {
  AccessRequestService,
  CompanyAccessService,
  UserProfileService,
} from "../services";
import { UnauthenticatedError } from "../services";
import {
  DefaultAccessRequestService,
  DefaultCompanyAccessService,
  DefaultUserProfileService,
} from "../services/implementations";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.email) {
    throw new UnauthenticatedError();
  }

  return {
    id: data.user.id,
    email: data.user.email,
  };
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

export function createCompanyAccessService(): CompanyAccessService {
  return new DefaultCompanyAccessService(
    new SupabaseCompanyMembershipRepository(),
    new SupabasePartnerCompanyRepository(),
    createUserProfileService(),
  );
}
