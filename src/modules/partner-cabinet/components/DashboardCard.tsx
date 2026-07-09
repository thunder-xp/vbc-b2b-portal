import Link from "next/link";
import type { ReactNode } from "react";

type DashboardCardProps = {
  title: string;
  description: string;
  href?: string;
  meta?: ReactNode;
};

export function DashboardCard({
  title,
  description,
  href,
  meta,
}: DashboardCardProps) {
  const content = (
    <article className="h-full rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
        {meta}
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
    </article>
  );

  if (!href) {
    return content;
  }

  return (
    <Link className="block h-full" href={href}>
      {content}
    </Link>
  );
}
