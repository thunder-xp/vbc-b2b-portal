import { ReservationRequestStatus } from "../types";
import { canonicalStatuses, StatusBadge } from "../../platform-ui";

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
  const descriptor = status === ReservationRequestStatus.Draft ? canonicalStatuses.draft
    : status === ReservationRequestStatus.Submitted ? canonicalStatuses.submitted
      : status === ReservationRequestStatus.UnderReview ? canonicalStatuses.underReview
        : status === ReservationRequestStatus.Approved ? canonicalStatuses.approved
          : status === ReservationRequestStatus.PartiallyApproved ? canonicalStatuses.partiallyApproved
            : status === ReservationRequestStatus.Rejected ? canonicalStatuses.rejected
              : canonicalStatuses.cancelled;
  return <StatusBadge label={labels[status]} status={descriptor} />;
}
