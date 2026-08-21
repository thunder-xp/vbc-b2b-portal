import type { EstimateLifecycleStatus, EstimateStatus } from "../types";
import { canonicalStatuses, StatusBadge } from "../../platform-ui";
import { partnerStatusLabel, type PartnerLocale } from "../../partner-locale";

export type EstimateDisplayStatus = EstimateLifecycleStatus | EstimateStatus;

export function EstimateStatusBadge({
  status = "draft",
  locale = "ru",
}: {
  status?: EstimateDisplayStatus;
  locale?: PartnerLocale;
}) {
  const descriptor =
    status === "draft"
      ? canonicalStatuses.draft
      : status === "ready"
        ? canonicalStatuses.ready
        : status === "sent"
          ? canonicalStatuses.sent
          : status === "accepted"
            ? canonicalStatuses.accepted
            : status === "rejected"
              ? canonicalStatuses.rejected
              : status === "archived"
                ? canonicalStatuses.archived
                : status === "converted_to_order"
                  ? canonicalStatuses.ready
                  : canonicalStatuses.expired;
  return (
    <StatusBadge
      accessibleLabel={`${locale === "ro" ? "Statut" : "Статус"}: ${partnerStatusLabel(locale, "estimate", status)}`}
      label={partnerStatusLabel(locale, "estimate", status)}
      status={descriptor}
    />
  );
}
