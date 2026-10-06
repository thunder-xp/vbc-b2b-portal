export function WorkspaceEmptyState({
  actionLabel,
  message,
  title,
}: {
  actionLabel: string;
  message: string;
  title: string;
}) {
  return (
    <div aria-live="assertive" data-partner-feedback="error" role="alert">
      <CircleX aria-hidden="true" data-partner-feedback-icon />
      <div>
        <h3 data-partner-feedback-title>{title}</h3>
        <p data-partner-feedback-body="with-title">{message}</p>
        <p className="mt-2 font-semibold">{actionLabel}</p>
      </div>
    </div>
  );
}
import { CircleX } from "lucide-react";
