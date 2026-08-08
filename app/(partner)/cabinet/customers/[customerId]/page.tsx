import Link from "next/link";
import { notFound } from "next/navigation";

import { getFinalCustomerAction } from "@/src/modules/estimates/actions";
import { FinalCustomerEditForm } from "@/src/modules/estimates/components/FinalCustomerEditForm";
import { EstimateStatusBadge } from "@/src/modules/estimates/components/EstimateStatusBadge";
import { finalCustomerIndustryLabel } from "@/src/modules/estimates/types";

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const result = await getFinalCustomerAction(customerId);
  if (!result.success) { if (result.errorCode === "NOT_FOUND" || result.errorCode === "INVALID_INPUT") notFound(); return <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{result.message}</p>; }
  const customer = result.data;
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="border-b border-zinc-200 pb-5"><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/customers">← Мои заказчики</Link><h1 className="mt-2 text-2xl font-semibold">{customer.displayName}</h1><p className="mt-1 text-sm text-zinc-500">Последняя активность: {formatDate(customer.lastActivityAt)}</p></header>
    <section aria-labelledby="customer-identity"><h2 className="text-lg font-semibold" id="customer-identity">Данные заказчика</h2><dl className="mt-4 grid gap-4 border-y border-zinc-200 py-4 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-zinc-500">Тип</dt><dd className="mt-1 text-sm font-medium">{customer.customerType === "company" ? "Компания" : "Физическое лицо"}</dd></div><div><dt className="text-xs text-zinc-500">IDNO</dt><dd className="mt-1 text-sm font-medium">{customer.fiscalCode ?? "—"}</dd></div><div><dt className="text-xs text-zinc-500">Город / регион</dt><dd className="mt-1 text-sm font-medium">{customer.locality ?? "—"}</dd></div><div><dt className="text-xs text-zinc-500">Отрасль</dt><dd className="mt-1 text-sm font-medium">{finalCustomerIndustryLabel(customer.industryCode)}</dd></div></dl><details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800">Изменить данные</summary><div className="pt-3"><FinalCustomerEditForm customer={customer} /></div></details></section>
    <section aria-labelledby="customer-estimates"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold" id="customer-estimates">Связанные сметы</h2><p className="mt-1 text-sm text-zinc-500">Проекты и объекты, где выбран этот заказчик.</p></div><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/estimates/new" prefetch={false}>Новая смета</Link></div>{customer.estimates.length ? <div className="mt-4 divide-y divide-zinc-100 border-y border-zinc-200">{customer.estimates.map((estimate) => <article className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={estimate.id}><div className="min-w-0"><Link className="font-semibold hover:text-emerald-700" href={`/cabinet/estimates/${estimate.id}`} prefetch={false}>{estimate.estimateNumber} · {estimate.name}</Link><p className="mt-1 truncate text-sm text-zinc-500">{estimate.projectName ?? "Проект / объект не указан"}</p></div><EstimateStatusBadge status={estimate.status} /><time className="text-sm text-zinc-500">{formatDate(estimate.updatedAt)}</time></article>)}</div> : <p className="mt-4 border-y border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500">Связанных смет нет.</p>}</section>
  </div>;
}

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "Нет активности"; }
