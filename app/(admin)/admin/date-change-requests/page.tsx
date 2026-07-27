import { listInternalOrderDateChangesAction } from "@/src/modules/orders/actions";
import { InternalOrderDateChangeReview } from "@/src/modules/orders/components";
import {
  AdminPageHeader,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function InternalOrderDateChangesPage() {
  await requireAdminPagePermission("order_date_changes.review");
  const result = await listInternalOrderDateChangesAction();
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Операции"
        title="Переносы планируемой отгрузки"
        description="Решение фиксируется в портале; авторитетная дата остаётся в 1С."
      />
      {!result.success ? (
        <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Очередь недоступна.
        </p>
      ) : (
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b bg-zinc-50">
              <tr>
                {["Компания", "Заказ", "Текущая дата", "Новая дата", "Комментарий", "Решение"].map((label) => (
                  <th className="px-4 py-3" key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.data.map((record) => (
                <tr key={record.request.id}>
                  <td className="px-4 py-3">{record.companyName}</td>
                  <td className="px-4 py-3">{record.orderLabel}</td>
                  <td className="px-4 py-3">{record.authoritativeDate}</td>
                  <td className="px-4 py-3">{record.request.requestedDate}</td>
                  <td className="px-4 py-3">{record.request.comment ?? "—"}</td>
                  <td className="px-4 py-3"><InternalOrderDateChangeReview requestId={record.request.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
