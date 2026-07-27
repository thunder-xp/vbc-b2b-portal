import { redirect } from "next/navigation";

import { getAccessRequestForReviewAction } from "@/src/modules/access-control/actions/admin/access-approval.actions";
import {
  AccessRequestDecisionForms,
  AccessRequestReviewDetail,
} from "@/src/modules/access-control/components/admin";
import { requireAdminPagePermission } from "@/src/modules/admin";

type AdminPartnerRequestDetailPageProps = {
  params: Promise<{
    requestId: string;
  }>;
};

export default async function AdminPartnerRequestDetailPage({
  params,
}: AdminPartnerRequestDetailPageProps) {
  await requireAdminPagePermission("admin.access_requests.view");
  const { requestId } = await params;
  const requestResult = await getAccessRequestForReviewAction(requestId);

  if (!requestResult.success && requestResult.errorCode === "AUTH_REQUIRED") {
    redirect("/auth/sign-in");
  }

  return (
    <div className="bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-5xl space-y-6">
        {!requestResult.success && (
          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-zinc-950">
              Request unavailable
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              {requestResult.message}
            </p>
          </section>
        )}

        {requestResult.success && (
          <>
            <AccessRequestReviewDetail request={requestResult.data} />
            <AccessRequestDecisionForms requestId={requestResult.data.id} />
          </>
        )}
      </div>
    </div>
  );
}
