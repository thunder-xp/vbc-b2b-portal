import { AlertTriangle, CheckCircle2, CircleAlert, Info } from "lucide-react";

import type { NotificationSeverity } from "../types";

const labels = {
  critical: { text: "Критично", icon: CircleAlert, className: "text-rose-700" },
  warning: { text: "Важно", icon: AlertTriangle, className: "text-amber-700" },
  information: { text: "Информация", icon: Info, className: "text-sky-700" },
  success: { text: "Выполнено", icon: CheckCircle2, className: "text-emerald-700" },
} satisfies Record<NotificationSeverity, {
  text: string;
  icon: typeof Info;
  className: string;
}>;

export function NotificationSeverityLabel({ severity }: { severity: NotificationSeverity }) {
  const label = labels[severity];
  const Icon = label.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${label.className}`}>
      <Icon aria-hidden="true" size={14} />
      {label.text}
    </span>
  );
}

