import type { ReactNode } from "react";

import { getActiveCompanyContextAction } from "@/src/modules/access-control/actions/get-active-company-context.action";
import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import { getOwnMembershipsAction } from "@/src/modules/access-control/actions/get-memberships.action";
import { MembershipStatus } from "@/src/modules/access-control/types";
import { PartnerLayout } from "@/src/modules/partner-cabinet/components";

export default async function CabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profileResult = await getCurrentProfileAction();
  const membershipsResult = await getOwnMembershipsAction();
  const activeMembership = membershipsResult.success
    ? membershipsResult.data.find(
        (membership) => membership.status === MembershipStatus.Active,
      )
    : null;
  const companyContextResult = activeMembership
    ? await getActiveCompanyContextAction(activeMembership.companyId)
    : null;

  return (
    <PartnerLayout
      companyContext={
        companyContextResult?.success ? companyContextResult.data : null
      }
      profile={profileResult.success ? profileResult.data : null}
    >
      {children}
    </PartnerLayout>
  );
}
