import Link from "next/link";

const features = ["B2B catalog", "Partner prices", "Stock visibility", "Online orders", "Documents"];

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Novotech Systems
        </p>
        <div className="mt-5 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              Novotech Partner Platform
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
              A secure B2B workspace for distribution partners to browse products,
              view permitted prices and stock, manage documents, and prepare
              online orders.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-zinc-800" href="/auth/sign-in">
                Sign In
              </Link>
              <Link className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-900 hover:border-emerald-700" href="/auth/register">
                Become a Partner
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">Partner workspace</h2>
            <div className="mt-5 grid gap-3">
              {features.map((feature) => (
                <div className="rounded-md bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-800" key={feature}>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
