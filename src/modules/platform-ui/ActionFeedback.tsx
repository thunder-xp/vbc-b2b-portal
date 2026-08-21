"use client";

import { AlertTriangle, CheckCircle2, Info, LoaderCircle } from "lucide-react";

import { platformCopy, usePartnerLocale } from "../partner-locale";

export type FeedbackKind = "success" | "warning" | "error" | "running" | "information";

const styles: Record<FeedbackKind, string> = {
  success: "border-emerald-500 bg-emerald-50 text-emerald-900",
  warning: "border-amber-500 bg-amber-50 text-amber-950",
  error: "border-red-500 bg-red-50 text-red-900",
  running: "border-sky-500 bg-sky-50 text-sky-900",
  information: "border-blue-500 bg-blue-50 text-blue-900",
};
const icons = { success: CheckCircle2, warning: AlertTriangle, error: AlertTriangle, running: LoaderCircle, information: Info };

export function ActionFeedback({ kind, title, message, correlationId }: {
  kind: FeedbackKind;
  title?: string;
  message: string;
  correlationId?: string | null;
}) {
  const copy = platformCopy(usePartnerLocale());
  const Icon = icons[kind];
  return <div aria-live={kind === "error" ? "assertive" : "polite"} className={`flex gap-3 border-l-4 px-4 py-3 text-sm ${styles[kind]}`} role={kind === "error" ? "alert" : "status"}>
    <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${kind === "running" ? "motion-safe:animate-spin" : ""}`} />
    <div><p className="font-semibold">{title ?? defaultTitle(kind, copy)}</p><p className="mt-0.5">{message}</p>{correlationId ? <p className="mt-1 text-xs opacity-70">{copy.referenceCode}: {correlationId}</p> : null}</div>
  </div>;
}

function defaultTitle(kind: FeedbackKind, copy: ReturnType<typeof platformCopy>) {
  return { success: copy.ready, warning: copy.attention, error: copy.failed, running: copy.running, information: copy.information }[kind];
}
