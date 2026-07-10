import type { AccessRequestReviewDto } from "../../actions/admin/access-approval.actions";

type AccessRequestReviewDetailProps = {
  request: AccessRequestReviewDto;
};

export function AccessRequestReviewDetail({
  request,
}: AccessRequestReviewDetailProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-700">
            Partner request
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
            {request.requestedCompanyName ?? "Partner access request"}
          </h1>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
          {request.status}
        </span>
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <Field label="Requester" value={request.requesterEmail ?? request.requesterUserId} />
        <Field label="Requester name" value={request.requesterName ?? "Not provided"} />
        <Field label="Fiscal code / VAT / IDNO" value={request.requestedFiscalCode ?? "Not provided"} />
        <Field label="Contact phone" value={request.contactPhone ?? "Not provided"} />
        <Field label="Submitted" value={request.createdAt} />
        <Field label="Updated" value={request.updatedAt} />
      </dl>

      {request.message && (
        <div className="mt-6 rounded-md bg-zinc-50 p-4">
          <h2 className="text-sm font-medium text-zinc-950">Message</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">
            {request.message}
          </p>
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words text-zinc-950">{value}</dd>
    </div>
  );
}
