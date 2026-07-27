import { createAdminOperationsService, requireAdminPagePermission } from "../services";
import { AdminPageHeader } from "./AdminPageHeader";

const CONFIG = {
  estimates: {
    permission: "admin.estimates.view",
    title: "Сметы и коммерческие предложения",
    description: "Поддержка смет, версий, PDF и отправок без изменения immutable-артефактов.",
  },
  finance: {
    permission: "admin.finance.view",
    title: "Финансы",
    description: "Сопоставление и состояние read-моделя балансов по договорам.",
  },
} as const;

export async function AdminSupportPageView({
  page,
  view,
}: {
  page?: number;
  view: keyof typeof CONFIG;
}) {
  const config = CONFIG[view];
  await requireAdminPagePermission(config.permission);
  const data = await createAdminOperationsService().getSupportPage(view, page);
  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow={view === "finance" ? "Финансы" : "Операции"} title={config.title} description={config.description} />
      <div className="overflow-x-auto border border-zinc-200 bg-white">
        <table className="min-w-[850px] w-full text-left text-sm">
          <thead className="border-b bg-zinc-50">
            <tr>{["Компания", "Номер / mapping", "Название", "Статус", "Позиций", "Версий / исключено", "Обновлено"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {data.records.map((record) => (
              <tr key={record.id}>
                <td className="px-4 py-3">{record.company}</td>
                <td className="px-4 py-3 font-mono text-xs">{record.reference}</td>
                <td className="px-4 py-3">{record.title}</td>
                <td className="px-4 py-3">{record.status}</td>
                <td className="px-4 py-3">{record.primaryCount}</td>
                <td className="px-4 py-3">{record.secondaryCount}</td>
                <td className="px-4 py-3">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(new Date(record.updatedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
