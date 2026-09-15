import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { customerDate, serviceStatusLabel, serviceTypeLabel } from "@/src/modules/final-customer/presentation";
import { CustomerPager } from "@/src/modules/final-customer/components";

export default async function CustomerServicePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const page = positivePage((await searchParams).page); const pageSize = 20;
  const result = await createFinalCustomerService().listServiceRequests(context.account, pageSize + 1, (page - 1) * pageSize);
  const requests = result.slice(0, pageSize); const hasNext = result.length > pageSize;
  const ro = locale === "ro";
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{ro ? "Service" : "Сервис"}</h1><p className="mt-1 text-sm text-zinc-600">{ro ? "Solicitări despre instalare, diagnosticare, garanție, produse și comenzi." : "Обращения по монтажу, диагностике, гарантии, товарам и заказам."}</p></div><Link className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white" href="/account/service/new"><Plus aria-hidden className="size-4" />{ro ? "Solicitare nouă" : "Новое обращение"}</Link></header>{requests.length ? <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">{requests.map((request) => <li key={request.id}><Link className="grid min-h-20 gap-2 p-4 hover:bg-zinc-50 sm:grid-cols-[1fr_auto_auto] sm:items-center" href={`/account/service/${request.id}`}><div><p className="font-mono text-xs text-zinc-500">{request.number}</p><p className="font-semibold">{request.subject}</p><p className="mt-1 text-xs text-zinc-500">{serviceTypeLabel(request.type, locale)} · {customerDate(request.createdAt, locale)}</p></div><span className="text-sm text-zinc-600">{serviceStatusLabel(request.status, locale)}</span><ArrowRight aria-hidden className="size-4" /></Link></li>)}</ul> : <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">{ro ? "Nu aveți solicitări." : "У вас пока нет обращений."}</p>}<CustomerPager hasNext={hasNext} page={page} path="/account/service" ro={ro} /></main>;
}
function positivePage(value?: string) { const page = Number(value); return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1; }
