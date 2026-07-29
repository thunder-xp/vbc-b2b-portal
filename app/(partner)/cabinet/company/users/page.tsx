import { redirect } from "next/navigation";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { getCompanyUsersAction } from "@/src/modules/access-control/actions/company-users.actions";
import { CompanyUsersPanel } from "@/src/modules/access-control/components/company-users";

export default async function CompanyUsersPage() {
  const result = await getCompanyUsersAction();
  if (!result.success) {
    if (result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
    redirect("/cabinet/company");
  }
  return <>
    <BehaviorViewEvent dedupeKey={`company-users:${result.data.users.page}`} eventName="company_users_viewed" resultCount={result.data.users.records.length} route="/cabinet/company/users" sourceSurface="company_users" />
    <CompanyUsersPanel
        companyId={result.data.company.id}
        companyName={result.data.company.displayName}
        events={result.data.events}
        isAdmin={false}
        page={result.data.users}
      />
  </>;
}
