"use client";

import { AlertTriangle, CheckCircle2, CircleAlert, Info } from "lucide-react";

import type { NotificationSeverity } from "../types";
import { notificationCopy, usePartnerLocale } from "../../partner-locale";

const labels = {
  critical: { key: "severityCritical", icon: CircleAlert, className: "text-rose-700" },
  warning: { key: "severityWarning", icon: AlertTriangle, className: "text-amber-700" },
  information: { key: "severityInformation", icon: Info, className: "text-sky-700" },
  success: { key: "severitySuccess", icon: CheckCircle2, className: "text-emerald-700" },
} satisfies Record<NotificationSeverity, {
  key: "severityCritical" | "severityWarning" | "severityInformation" | "severitySuccess";
  icon: typeof Info;
  className: string;
}>;

export function NotificationSeverityLabel({ severity }: { severity: NotificationSeverity }) {
  const copy = notificationCopy(usePartnerLocale());
  const label = labels[severity];
  const Icon = label.icon;
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${label.className}`}><Icon aria-hidden="true" size={14} />{copy[label.key]}</span>;
}
