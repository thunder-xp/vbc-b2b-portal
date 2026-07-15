import type { EstimateStatus } from "../types";

const labels: Record<EstimateStatus, string> = {
  draft: "Черновик",
  ready: "Готово",
  sent: "Отправлено",
  accepted: "Принято",
  rejected: "Отклонено",
  archived: "Архив",
};

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  const tone = status === "draft"
    ? "bg-amber-100 text-amber-800"
    : status === "accepted"
      ? "bg-emerald-100 text-emerald-800"
      : status === "rejected"
        ? "bg-red-100 text-red-800"
        : "bg-zinc-100 text-zinc-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{labels[status]}</span>;
}

export { labels as estimateStatusLabels };
