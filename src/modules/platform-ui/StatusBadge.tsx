import {
  AlertTriangle,
  Check,
  Clock3,
  Info,
  LoaderCircle,
  Minus,
} from "lucide-react";

import type { StatusDescriptor } from "./status-model";

const categoryClassName: Record<StatusDescriptor["category"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
  information: "border-blue-200 bg-blue-50 text-blue-800",
  running: "border-sky-200 bg-sky-50 text-sky-800",
};
const icons = {
  check: Check,
  clock: Clock3,
  alert: AlertTriangle,
  info: Info,
  loader: LoaderCircle,
  minus: Minus,
};

export function StatusBadge({
  accessibleLabel,
  status,
  label,
}: {
  accessibleLabel?: string;
  status: StatusDescriptor;
  label?: string;
}) {
  const Icon = icons[status.icon];
  const displayedLabel = label ?? status.label;
  return (
    <span
      aria-label={accessibleLabel ?? `Статус: ${displayedLabel}`}
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${categoryClassName[status.category]}`}
    >
      <Icon
        aria-hidden="true"
        className={`size-3.5 ${status.category === "running" ? "motion-safe:animate-spin" : ""}`}
      />
      {displayedLabel}
    </span>
  );
}
