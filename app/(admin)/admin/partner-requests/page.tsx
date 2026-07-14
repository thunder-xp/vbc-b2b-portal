import { redirect } from "next/navigation";

import { listPendingAccessRequestsForReviewAction } from "@/src/modules/access-control/actions/admin/access-approval.actions";
import { AccessRequestReviewList } from "@/src/modules/access-control/components/admin";

export default async function AdminPartnerRequestsPage() {
  const requestsResult = await listPendingAccessRequestsForReviewAction();

  if (!requestsResult.success && requestsResult.errorCode === "AUTH_REQUIRED") {
    redirect("/auth/sign-in");
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-700">
            Access control
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Partner approval console
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Проверяйте заявки компаний и связывайте одобренный доступ с
            подтверждённым контрагентом, договором и статусом партнёра в 1С.
          </p>
        </div>

        {!requestsResult.success && (
          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">
              Approval console unavailable
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              {requestsResult.message}
            </p>
          </section>
        )}

        {requestsResult.success && (
          <AccessRequestReviewList requests={requestsResult.data} />
        )}
      </div>
    </main>
  );
}
