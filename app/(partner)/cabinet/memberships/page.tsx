import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { EmptyState, MembershipCard } from "@/src/modules/partner-cabinet/components";

export default async function CabinetMembershipsPage() {
  const result = await getPartnerWorkspaceContextAction();
  if (!result.success || !result.data.companyName || !result.data.membershipRole) {
    return <EmptyState message="Активное участие в компании не найдено." title="Доступ к компании" />;
  }
  return <MembershipCard context={result.data} />;
}
