import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export type PartnerFeedbackKind = "info" | "success" | "warning" | "error";

const icons = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleX,
} as const;

export function PartnerFeedback({
  children,
  kind,
  title,
}: {
  children: ReactNode;
  kind: PartnerFeedbackKind;
  title?: string;
}) {
  const Icon = icons[kind];
  return (
    <div
      aria-live={kind === "error" ? "assertive" : "polite"}
      data-partner-feedback={kind}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" data-partner-feedback-icon />
      <div className="min-w-0">
        {title ? <p data-partner-feedback-title>{title}</p> : null}
        <div data-partner-feedback-body={title ? "with-title" : "only"}>{children}</div>
      </div>
    </div>
  );
}
