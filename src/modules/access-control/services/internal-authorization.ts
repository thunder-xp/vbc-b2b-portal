import { isDevTestInternalManagerEmail } from "@/src/lib/dev-test-mode";

import { UserStatus, UserType, type UserProfile } from "../types";

export function canApprovePartnerRequests(profile: UserProfile): boolean {
  if (profile.status !== UserStatus.Active) {
    return false;
  }

  if (profile.userType === UserType.Internal || profile.userType === UserType.Admin) {
    return true;
  }

  return isDevTestInternalManagerEmail(profile.email);
}
