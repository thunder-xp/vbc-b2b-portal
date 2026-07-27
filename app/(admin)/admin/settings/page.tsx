import {
  AdminGovernanceSummary,
  AdminPageHeader,
  createAdminOperationsService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

const SCHEDULES = [
  ["Каталог", "55 2 * * *"],
  ["Курсы", "15 22 * * *"],
  ["Цены", "25 23 * * *"],
  ["Остатки", "35 0 * * *"],
  ["Активные заказы", "*/15 * * * *"],
  ["История заказов", "30 4 * * *"],
  ["Финансы", "5 * * * *"],
] as const;

export default async function AdminSettingsPage() {
  await requireAdminPagePermission("admin.settings.view");
  const { metrics } = await createAdminOperationsService().getGovernanceSummary("settings");
  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Настройки" title="Роли и разрешения" description="Read-only метаданные ролей, разрешений и deployment-расписаний." />
      <AdminGovernanceSummary metrics={metrics} />
      <section className="border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Расписания синхронизации</h2>
        <dl className="mt-4 divide-y">
          {SCHEDULES.map(([label, schedule]) => (
            <div className="flex justify-between gap-4 py-2 text-sm" key={label}>
              <dt>{label}</dt><dd className="font-mono">{schedule}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-zinc-500">Изменение расписаний из браузера отключено.</p>
      </section>
    </div>
  );
}
