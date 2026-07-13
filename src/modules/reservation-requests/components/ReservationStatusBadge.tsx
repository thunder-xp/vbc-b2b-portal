import { ReservationRequestStatus } from "../types";

const labels: Record<ReservationRequestStatus, string> = {
  [ReservationRequestStatus.Draft]: "Черновик",
  [ReservationRequestStatus.Submitted]: "Отправлен",
  [ReservationRequestStatus.UnderReview]: "На рассмотрении",
  [ReservationRequestStatus.Approved]: "Одобрен",
  [ReservationRequestStatus.PartiallyApproved]: "Одобрен частично",
  [ReservationRequestStatus.Rejected]: "Отклонён",
  [ReservationRequestStatus.Cancelled]: "Отменён",
};

export function ReservationStatusBadge({ status }: { status: ReservationRequestStatus }) {
  const tone = status === ReservationRequestStatus.Rejected || status === ReservationRequestStatus.Cancelled
    ? "bg-red-100 text-red-800"
    : status === ReservationRequestStatus.PartiallyApproved
      ? "bg-amber-100 text-amber-900"
      : status === ReservationRequestStatus.Draft
        ? "bg-zinc-100 text-zinc-700"
        : "bg-emerald-100 text-emerald-800";
  return <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{labels[status]}</span>;
}
