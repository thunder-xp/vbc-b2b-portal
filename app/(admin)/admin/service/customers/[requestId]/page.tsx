import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { updateCustomerServiceRequestStatusAction } from "@/src/modules/final-customer/admin-actions";
import { createFinalCustomerService } from "@/src/modules/final-customer/server";
import { CUSTOMER_SERVICE_REQUEST_STATUSES } from "@/src/modules/final-customer/types";
import { customerDate, serviceStatusLabel, serviceTypeLabel } from "@/src/modules/final-customer/presentation";

export default async function AdminCustomerServiceDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  await requireAdminPagePermission("admin.service.view");
  const { requestId } = await params;
  const request = await createFinalCustomerService().findAdminServiceRequest(requestId); if (!request) notFound();
  return <div className="max-w-3xl space-y-5"><header><Link className="text-sm font-semibold text-emerald-700" href="/admin/service/customers">← Обращения клиентов</Link><p className="mt-3 font-mono text-xs text-zinc-500">{request.number}</p><h1 className="mt-1 text-2xl font-semibold">{request.subject}</h1><p className="mt-2 text-sm text-zinc-600">{serviceTypeLabel(request.type, "ru")} · {customerDate(request.createdAt, "ru")}</p></header><section className="rounded-lg border border-zinc-200 bg-white p-5"><p className="whitespace-pre-wrap text-sm leading-6">{request.description}</p><p className="mt-4 text-xs text-zinc-500">Предпочтительная связь: {request.preferredContact === "EMAIL" ? "Email" : "Телефон"}</p>{request.orderId ? <p className="mt-3 font-mono text-xs text-zinc-500">Retail order: {request.orderId}</p> : null}</section><form action={updateCustomerServiceRequestStatusAction} className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-end"><input name="requestId" type="hidden" value={request.id} /><input name="expectedVersion" type="hidden" value={request.version} /><label className="text-sm font-medium">Статус<select className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3" defaultValue={request.status} name="status">{CUSTOMER_SERVICE_REQUEST_STATUSES.map((status) => <option key={status} value={status}>{serviceStatusLabel(status, "ru")}</option>)}</select></label><button className="min-h-11 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white">Сохранить статус</button></form></div>;
}
