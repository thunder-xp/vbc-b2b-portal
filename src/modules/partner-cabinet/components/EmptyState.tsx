import { EmptyState as PlatformEmptyState } from "../../platform-ui";

type EmptyStateProps = {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

export function EmptyState({
  title,
  message,
  actionHref,
  actionLabel,
}: EmptyStateProps) {
  return <PlatformEmptyState actionHref={actionHref} actionLabel={actionLabel} message={message} prefetch={false} title={title} />;
}
