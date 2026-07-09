import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-16 text-zinc-950">
      <section className="w-full max-w-2xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
          Novotech Systems
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          B2B Partner Platform
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600">
          Initial foundation for the partner-facing distribution portal. Product
          features, authentication, database schema, and 1C integration are not
          implemented yet.
        </p>
        <div className="mt-8 border-t border-zinc-200 pt-5 text-sm text-zinc-500">
          1C remains the source of truth. The portal starts as a clean
          foundation for partner access, catalog visibility, and order creation.
        </div>
        <p className="mt-4 text-sm font-medium text-zinc-700">
          Platform foundation is ready.
        </p>
        <div className="mt-8">
          <Link
            className="inline-flex items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            href="/onboarding"
          >
            Open onboarding
          </Link>
        </div>
      </section>
    </main>
  );
}
