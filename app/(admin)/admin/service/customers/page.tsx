import Link from "next/link";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createFinalCustomerService } from "@/src/modules/final-customer/server";
import { CUSTOMER_SERVICE_REQUEST_STATUSES, type CustomerServiceRequestStatus } from "@/src/modules/final-customer/types";
import { customerDate, serviceStatusLabel, serviceTypeLabel } from "@/src/modules/final-customer/presentation";

const queueStatuses = ["NEW", "NEED_INFO", "IN_REVIEW", "ACCEPTED"] as const;

export default async function AdminCustomerServicePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPagePermission("admin.service.view");
  const statusValue = (await searchParams).status;
  const status = CUSTOMER_SERVICE_REQUEST_STATUSES.includes(statusValue as CustomerServiceRequestStatus) ? statusValue as CustomerServiceRequestStatus : null;
  const requests = await createFinalCustomerService().listAdminServiceRequests(status);
  return <div className="space-y-5"><header><p className="text-xs font-semibold uppercase text-emerald-700">Операции</p><h1 className="mt-1 text-2xl font-semibold">Обращения частных клиентов</h1><p className="mt-2 text-sm text-zinc-600">Очередь ответов и обработки сервисных обращений.</p></header><nav aria-label="Очереди" className="flex flex-wrap gap-2"><Link className={chip(!status)} href="/admin/service/customers">Все</Link>{queueStatuses.map((value) => <Link className={chip(status === value)} href={`/admin/service/customers?status=${value}`} key={value}>{serviceStatusLabel(value, "ru")}</Link>)}</nav><form className="flex flex-wrap gap-2"><select className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" defaultValue={status ?? ""} name="status"><option value="">Все статусы</option>{CUSTOMER_SERVICE_REQUEST_STATUSES.map((value) => <option key={value} value={value}>{serviceStatusLabel(value, "ru")}</option>)}</select><button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white">Применить</button></form>{requests.length ? <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">{requests.map((request) => <li className={request.status === "NEED_INFO" ? "bg-amber-50" : undefined} key={request.id}><Link className="grid gap-2 p-4 hover:bg-zinc-50 sm:grid-cols-[1fr_auto]" href={`/admin/service/customers/${request.id}`}><div><p className="font-mono text-xs text-zinc-500">{request.number}</p><p className="font-semibold">{request.subject}</p><p className="mt-1 text-xs text-zinc-500">{serviceTypeLabel(request.type, "ru")} · {customerDate(request.createdAt, "ru")} · обновлено {customerDate(request.updatedAt, "ru")}</p></div><span className="text-sm font-medium">{serviceStatusLabel(request.status, "ru")}</span></Link></li>)}</ul> : <p className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-500">Обращений нет.</p>}</div>;
}

function chip(active: boolean) { return `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${active ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-700"}`; }
