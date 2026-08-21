import { notFound } from "next/navigation";
import { getReservationRequestAction } from "@/src/modules/reservation-requests/actions";
import { ReservationDetail } from "@/src/modules/reservation-requests/components";
import { projectCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function ReservationRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, locale] = await Promise.all([params, getPartnerLocale()]);
  const copy = projectCopy(locale);
  const result = await getReservationRequestAction(id);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return (
      <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {copy.requestLoadError}
      </p>
    );
  }
  return <ReservationDetail request={result.data} />;
}
