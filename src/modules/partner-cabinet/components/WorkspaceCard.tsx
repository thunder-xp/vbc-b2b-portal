import Link from "next/link";
import type { ReactNode } from "react";

export function WorkspaceCard({
  actionHref,
  actionLabel,
  children,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex min-h-8 items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
        {actionHref && actionLabel && (
          <Link
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
            href={actionHref}
          >
            {actionLabel}
          </Link>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
