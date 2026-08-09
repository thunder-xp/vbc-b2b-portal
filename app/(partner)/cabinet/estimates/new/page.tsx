import Link from "next/link";

import { listEstimateCurrenciesAction } from "@/src/modules/estimates/actions";
import { EstimateCreateForm } from "@/src/modules/estimates/components/EstimateCreateForm";

export default async function NewEstimatePage() {
  const currencies = await listEstimateCurrenciesAction();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header className="border-b border-zinc-200 pb-5"><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/estimates">← Сметы и КП</Link><h1 className="mt-2 text-2xl font-semibold">Новая смета</h1><p className="mt-1 text-sm text-zinc-500">Укажите назначение расчёта. Оборудование, услуги, НДС и коммерческие условия настраиваются после создания.</p></header>
      {!currencies.success ? <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{currencies.message}</p> : <section className="border-y border-zinc-200 bg-white px-4 py-5 sm:px-6"><EstimateCreateForm currencies={currencies.data} /></section>}
    </div>
  );
}
