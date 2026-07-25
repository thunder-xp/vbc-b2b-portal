import { redirect } from "next/navigation";

import { getCompanyUsersAction } from "@/src/modules/access-control/actions/company-users.actions";
import { CompanyUsersPanel } from "@/src/modules/access-control/components/company-users";

export default async function CompanyUsersPage() {
  const result = await getCompanyUsersAction();
  if (!result.success) {
    if (result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
    redirect("/cabinet/company");
  }
  return (
    <CompanyUsersPanel
      companyId={result.data.company.id}
      companyName={result.data.company.displayName}
      events={result.data.events}
      isAdmin={false}
      page={result.data.users}
    />
  );
}
