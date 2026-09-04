import Link from "next/link";
import type { ReactNode } from "react";

type AuthPageShellProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  maxWidth?: "md" | "lg";
  title: string;
};

export function AuthPageShell({
  children,
  description,
  eyebrow,
  maxWidth = "md",
  title,
}: AuthPageShellProps) {
  return (
    <main className="app-responsive-surface flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-950">
      <section className={`w-full rounded-lg border border-zinc-200 bg-white p-6 shadow-sm min-[2560px]:p-8 ${maxWidth === "lg" ? "app-auth-panel-lg" : "app-auth-panel-md"}`}>
        <Link className="text-sm font-medium text-emerald-700" href="/">
          {eyebrow}
        </Link>
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}

export function AuthPageLoading() {
  return (
    <main aria-busy="true" className="app-responsive-surface flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <div aria-hidden="true" className="app-auth-panel-md h-80 w-full animate-pulse rounded-lg border border-zinc-200 bg-white" />
    </main>
  );
}
