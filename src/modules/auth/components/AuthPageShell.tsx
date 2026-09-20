import Link from "next/link";
import type { ReactNode } from "react";

type AuthPageShellProps = {
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  description: string;
  eyebrow: string;
  maxWidth?: "md" | "lg";
  title: string;
  homeHref?: string;
};

export function AuthPageShell({
  backHref,
  backLabel,
  children,
  description,
  eyebrow,
  maxWidth = "md",
  title,
  homeHref = "/",
}: AuthPageShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-6 text-zinc-950 sm:px-6 sm:py-8">
      <section className={`w-full rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 ${maxWidth === "lg" ? "max-w-lg" : "max-w-md"}`}>
        <Link className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-medium text-emerald-700" href={homeHref}>
          {eyebrow}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm leading-6 text-zinc-600">{description}</p>
        {backHref && backLabel ? (
          <Link className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 hover:text-emerald-900" href={backHref}>
            ← {backLabel}
          </Link>
        ) : null}
        <div className="mt-5">{children}</div>
      </section>
    </main>
  );
}

export function AuthPageLoading() {
  return (
    <main aria-busy="true" className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <div aria-hidden="true" className="h-80 w-full max-w-md animate-pulse rounded-lg border border-zinc-200 bg-white" />
    </main>
  );
}
