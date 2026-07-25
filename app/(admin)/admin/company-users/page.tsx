import { redirect } from "next/navigation";

import {
  getCompanyUsersAction,
  listManageableCompaniesAction,
} from "@/src/modules/access-control/actions";
import { CompanyUsersPanel } from "@/src/modules/access-control/components/company-users";

export default async function AdminCompanyUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { companyId } = await searchParams;
  const companiesResult = await listManageableCompaniesAction();
  if (!companiesResult.success) {
    if (companiesResult.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
    redirect("/admin/partner-requests");
  }
  const selectedId = companyId ?? companiesResult.data[0]?.id;
  const usersResult = selectedId ? await getCompanyUsersAction({ companyId: selectedId }) : null;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <form className="flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm font-medium text-zinc-800">
            Компания
            <select className="h-11 min-w-72 rounded-md border border-zinc-300 bg-white px-3" defaultValue={selectedId} name="companyId">
              {companiesResult.data.map((company) => <option key={company.id} value={company.id}>{company.displayName}</option>)}
            </select>
          </label>
          <button className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white">Открыть</button>
        </form>
        {usersResult?.success ? (
          <CompanyUsersPanel
            companyId={usersResult.data.company.id}
            companyName={usersResult.data.company.displayName}
            events={usersResult.data.events}
            isAdmin
            page={usersResult.data.users}
          />
        ) : <p className="rounded-lg bg-white p-6 text-sm text-zinc-600">Нет доступных компаний.</p>}
      </div>
    </main>
  );
}
