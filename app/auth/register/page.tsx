import Link from "next/link";

import { RegisterForm } from "@/src/modules/auth/components";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-950">
      <section className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <Link className="text-sm font-medium text-emerald-700" href="/">
          Novotech Partner Platform
        </Link>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Become a Partner
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Create an account. Novotech will review company access before the
          cabinet is enabled.
        </p>
        <div className="mt-6">
          <RegisterForm />
        </div>
      </section>
    </main>
  );
}
