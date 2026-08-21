"use client";

import { ReservationRequestStatus } from "../types";
import { canonicalStatuses, StatusBadge } from "../../platform-ui";
import { reservationStatusLabel, usePartnerLocale } from "../../partner-locale";

export function ReservationStatusBadge({
  status,
}: {
  status: ReservationRequestStatus;
}) {
  const locale = usePartnerLocale();
  const descriptor =
    status === ReservationRequestStatus.Draft
      ? canonicalStatuses.draft
      : status === ReservationRequestStatus.Submitted
        ? canonicalStatuses.submitted
        : status === ReservationRequestStatus.UnderReview
          ? canonicalStatuses.underReview
          : status === ReservationRequestStatus.Approved
            ? canonicalStatuses.approved
            : status === ReservationRequestStatus.PartiallyApproved
              ? canonicalStatuses.partiallyApproved
              : status === ReservationRequestStatus.Rejected
                ? canonicalStatuses.rejected
                : canonicalStatuses.cancelled;
  return (
    <StatusBadge
      label={reservationStatusLabel(locale, status)}
      status={descriptor}
    />
  );
}
