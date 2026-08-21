import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { EmptyState, MembershipCard } from "@/src/modules/partner-cabinet/components";
import { companyCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function CabinetMembershipsPage() {
  const [result, locale] = await Promise.all([getPartnerWorkspaceContextAction(), getPartnerLocale()]);
  const copy = companyCopy(locale);
  if (!result.success || !result.data.companyName || !result.data.membershipRole) {
    return <EmptyState message={copy.noMembership} title={copy.companyAccess} />;
  }
  return <MembershipCard context={result.data} locale={locale} />;
}
