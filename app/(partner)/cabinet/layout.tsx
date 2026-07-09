import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { getActiveCompanyContextAction } from "@/src/modules/access-control/actions/get-active-company-context.action";
import { getOwnAccessRequestsAction } from "@/src/modules/access-control/actions/get-access-requests.action";
import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import { getOwnMembershipsAction } from "@/src/modules/access-control/actions/get-memberships.action";
import { AccessRequestStatus, MembershipStatus } from "@/src/modules/access-control/types";
import { PartnerLayout } from "@/src/modules/partner-cabinet/components";

export default async function CabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profileResult = await getCurrentProfileAction();

  if (!profileResult.success) {
    redirect("/auth/sign-in");
  }

  if (!profileResult.data) {
    redirect("/onboarding/profile");
  }

  const membershipsResult = await getOwnMembershipsAction();
  const activeMembership = membershipsResult.success
    ? membershipsResult.data.find(
        (membership) => membership.status === MembershipStatus.Active,
      )
    : null;

  if (!activeMembership) {
    const requestsResult = await getOwnAccessRequestsAction();
    const hasPendingRequest =
      requestsResult.success &&
      requestsResult.data.some(
        (request) => request.status === AccessRequestStatus.PendingReview,
      );

    redirect(hasPendingRequest ? "/onboarding/waiting" : "/onboarding/access-request");
  }

  const companyContextResult = activeMembership
    ? await getActiveCompanyContextAction(activeMembership.companyId)
    : null;

  return (
    <PartnerLayout
      companyContext={
        companyContextResult?.success ? companyContextResult.data : null
      }
      profile={profileResult.data}
    >
      {children}
    </PartnerLayout>
  );
}
