import Link from "next/link";

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
  return (
    <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">
        {message}
      </p>
      {actionHref && actionLabel && (
        <Link
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      )}
    </section>
  );
}
