import { notFound } from "next/navigation";
import { getReservationEntryAction } from "@/src/modules/reservation-requests/actions";
import { ReservationCreateForm } from "@/src/modules/reservation-requests/components";
import { projectCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function NewReservationRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ specificationId?: string }>;
}) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = projectCopy(locale);
  const specificationId = params.specificationId?.trim() ?? "";
  if (!specificationId) notFound();
  const result = await getReservationEntryAction(specificationId);
  if (!result.success)
    return (
      <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {copy.requestLoadError}
      </p>
    );
  if (result.data.existingRequestId)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{copy.requestCreated}</h1>
        <a
          className="font-semibold text-emerald-700"
          href={`/cabinet/reservation-requests/${result.data.existingRequestId}`}
        >
          {copy.openRequest} →
        </a>
      </div>
    );
  if (!result.data.approved)
    return (
      <p className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {copy.approvedOnly}
      </p>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="border-b border-zinc-200 pb-5">
        <p className="text-xs font-semibold uppercase text-emerald-700">
          {copy.newRequest}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          {result.data.projectName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {result.data.customerSiteName}
        </p>
      </header>
      <section className="border border-zinc-200 bg-white p-6">
        <ReservationCreateForm specificationId={specificationId} />
      </section>
    </div>
  );
}
