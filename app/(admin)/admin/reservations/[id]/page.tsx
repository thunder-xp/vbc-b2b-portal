import { notFound } from "next/navigation";

import { getInternalReservationRequestAction } from "@/src/modules/reservation-requests/actions";
import {
  InternalReservationReviewPanel,
  ReservationDetail,
} from "@/src/modules/reservation-requests/components";
import { requireAdminPagePermission } from "@/src/modules/admin";

export default async function AdminReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPagePermission("reservations.review");
  const { id } = await params;
  const result = await getInternalReservationRequestAction(id);
  if (!result.success) notFound();
  return (
    <div className="space-y-6">
      <ReservationDetail request={result.data} />
      <InternalReservationReviewPanel request={result.data} />
    </div>
  );
}
