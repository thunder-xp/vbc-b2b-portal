import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { actionClassName } from "./action-styles";

export function EmptyState({
  actionHref,
  actionLabel,
  icon: Icon,
  message,
  prefetch = false,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  icon?: LucideIcon;
  message: string;
  prefetch?: boolean;
  title: string;
}) {
  return (
    <section className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center" data-ui-empty-state>
      {Icon ? <Icon aria-hidden="true" className="mx-auto size-8 text-emerald-700" data-ui-empty-state-icon /> : null}
      <h2 className="mt-3 text-lg font-semibold text-zinc-950" data-ui-empty-state-title>{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600" data-ui-empty-state-body>{message}</p>
      {actionHref && actionLabel ? <Link className={`${actionClassName.primary} mt-5`} data-ui-empty-state-action href={actionHref} prefetch={prefetch}>{actionLabel}</Link> : null}
    </section>
  );
}
