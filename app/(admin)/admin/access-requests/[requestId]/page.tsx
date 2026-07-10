import { getAccessRequestForReviewAction } from "@/src/modules/access-control/actions/admin/access-approval.actions";
import {
  AccessRequestDecisionForms,
  AccessRequestReviewDetail,
} from "@/src/modules/access-control/components/admin";

type AdminAccessRequestDetailPageProps = {
  params: Promise<{
    requestId: string;
  }>;
};

export default async function AdminAccessRequestDetailPage({
  params,
}: AdminAccessRequestDetailPageProps) {
  const { requestId } = await params;
  const requestResult = await getAccessRequestForReviewAction(requestId);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
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
    </main>
  );
}
