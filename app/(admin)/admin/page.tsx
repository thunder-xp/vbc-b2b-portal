import {
  AdminDashboardView,
  createAdminDashboardService,
  requireAdminPermission,
} from "@/src/modules/admin";

export default async function AdminDashboardPage() {
  await requireAdminPermission("admin.dashboard.view");
  const dashboard = await createAdminDashboardService().getDashboard();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Операционный центр
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Рабочий стол</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Краткая операционная картина. Ситуации, требующие внимания, доступны в центре уведомлений.
        </p>
      </header>
      <AdminDashboardView dashboard={dashboard} />
    </div>
  );
}
