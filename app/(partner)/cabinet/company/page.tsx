import { getActiveCompanyContextAction } from "@/src/modules/access-control/actions/get-active-company-context.action";
import { getOwnMembershipsAction } from "@/src/modules/access-control/actions/get-memberships.action";
import { MembershipStatus } from "@/src/modules/access-control/types";
import { CompanyCard, EmptyState } from "@/src/modules/partner-cabinet/components";

export default async function CabinetCompanyPage() {
  const membershipsResult = await getOwnMembershipsAction();

  if (!membershipsResult.success) {
    return (
      <EmptyState
        actionHref="/onboarding"
        actionLabel="Open onboarding"
        message={membershipsResult.message}
        title="Company unavailable"
      />
    );
  }

  const activeMembership = membershipsResult.data.find(
    (membership) => membership.status === MembershipStatus.Active,
  );

  if (!activeMembership) {
    return (
      <EmptyState
        actionHref="/onboarding/waiting"
        actionLabel="View request status"
        message="Company details appear after Novotech approves an active partner company membership."
        title="No active company"
      />
    );
  }

  const contextResult = await getActiveCompanyContextAction(
    activeMembership.companyId,
  );

  if (!contextResult.success) {
    return (
      <EmptyState
        message={contextResult.message}
        title="Company context unavailable"
      />
    );
  }

  return <CompanyCard context={contextResult.data} />;
}
