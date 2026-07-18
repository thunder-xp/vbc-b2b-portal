import { redirect } from "next/navigation";

import { getCommercialRateAdminViewAction } from "@/src/modules/pricing-inventory/actions";
import { CommercialRateAdminPanel } from "@/src/modules/pricing-inventory/components";

export default async function CommercialRatesPage() {
  const result = await getCommercialRateAdminViewAction();
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="border-b border-zinc-200 pb-5">
          <p className="text-xs font-semibold uppercase text-emerald-700">Внутренний контур</p>
          <h1 className="mt-2 text-2xl font-semibold">Коммерческие курсы</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">Временная контролируемая публикация независимых курсов, вручную сверенных с 1С.</p>
        </header>
        {!result.success ? (
          <p className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Доступ к публикации коммерческих курсов запрещён.</p>
        ) : <CommercialRateAdminPanel data={result.data} />}
      </div>
    </main>
  );
}
