import type { LucideIcon } from "lucide-react";

import { EmptyState as PlatformEmptyState } from "../../platform-ui";

type EmptyStateProps = {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: LucideIcon;
};

export function EmptyState({
  title,
  message,
  actionHref,
  actionLabel,
  icon,
}: EmptyStateProps) {
  return <PlatformEmptyState actionHref={actionHref} actionLabel={actionLabel} icon={icon} message={message} prefetch={false} title={title} />;
}
