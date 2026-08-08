import type { EstimateLifecycleStatus, EstimateStatus } from "../types";
import { canonicalStatuses, StatusBadge } from "../../platform-ui";

export type EstimateDisplayStatus = EstimateLifecycleStatus | EstimateStatus;

const labels: Record<EstimateDisplayStatus, string> = {
  draft: "Черновик",
  ready: "Готово",
  sent: "Отправлено",
  accepted: "Принято",
  rejected: "Отклонено",
  expired: "Срок истёк",
  converted_to_order: "Переведено в заказ",
  archived: "Архив",
};

export function EstimateStatusBadge({ status = "draft" }: { status?: EstimateDisplayStatus }) {
  const descriptor = status === "draft" ? canonicalStatuses.draft
    : status === "ready" ? canonicalStatuses.ready
      : status === "sent" ? canonicalStatuses.sent
        : status === "accepted" ? canonicalStatuses.accepted
          : status === "rejected" ? canonicalStatuses.rejected
            : status === "archived" ? canonicalStatuses.archived
              : status === "converted_to_order" ? canonicalStatuses.ready
                : canonicalStatuses.expired;
  return <StatusBadge label={labels[status]} status={descriptor} />;
}

export { labels as estimateStatusLabels };
