import { notFound } from "next/navigation";
import { getReservationRequestAction } from "@/src/modules/reservation-requests/actions";
import { ReservationDetail } from "@/src/modules/reservation-requests/components";

export default async function ReservationRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getReservationRequestAction(id);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") notFound();
    return <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.message}</p>;
  }
  return <ReservationDetail request={result.data} />;
}
