import Link from "next/link";

type OnboardingStateCardProps = {
  title: string;
  message: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function OnboardingStateCard({
  title,
  message,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: OnboardingStateCardProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{message}</p>
      {(primaryHref || secondaryHref) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {primaryHref && primaryLabel && (
            <Link
              className="inline-flex items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              href={primaryHref}
            >
              {primaryLabel}
            </Link>
          )}
          {secondaryHref && secondaryLabel && (
            <Link
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              href={secondaryHref}
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
