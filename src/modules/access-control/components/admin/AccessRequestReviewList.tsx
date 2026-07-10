import Link from "next/link";

import type { AccessRequestReviewDto } from "../../actions/admin/access-approval.actions";

type AccessRequestReviewListProps = {
  requests: AccessRequestReviewDto[];
};

export function AccessRequestReviewList({
  requests,
}: AccessRequestReviewListProps) {
  if (requests.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">
          No pending requests
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          New partner requests will appear here after submission.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="divide-y divide-zinc-200">
        {requests.map((request) => (
          <article className="p-5" key={request.id}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">
                  {request.requestedCompanyName ?? "Partner access request"}
                </h2>
                <dl className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-zinc-500">Requester</dt>
                    <dd>{request.requesterEmail ?? request.requesterUserId}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Fiscal code</dt>
                    <dd>{request.requestedFiscalCode ?? "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Contact phone</dt>
                    <dd>{request.contactPhone ?? "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500">Status</dt>
                    <dd>{request.status}</dd>
                  </div>
                </dl>
              </div>
              <Link
                className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800"
                href={`/admin/partner-requests/${request.id}`}
              >
                Review
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
