import type { EstimateStatus } from "../types";
import { canonicalStatuses, StatusBadge } from "../../platform-ui";

const labels: Record<EstimateStatus, string> = {
  draft: "Черновик",
  ready: "Готово",
  sent: "Отправлено",
  accepted: "Принято",
  rejected: "Отклонено",
  archived: "Архив",
};

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  const descriptor = status === "draft" ? canonicalStatuses.draft
    : status === "ready" ? canonicalStatuses.ready
      : status === "sent" ? canonicalStatuses.sent
        : status === "accepted" ? canonicalStatuses.accepted
          : status === "rejected" ? canonicalStatuses.rejected
            : canonicalStatuses.archived;
  return <StatusBadge label={labels[status]} status={descriptor} />;
}

export { labels as estimateStatusLabels };
