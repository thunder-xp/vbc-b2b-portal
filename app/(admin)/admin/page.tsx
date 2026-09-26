import {
  AdminActionCenterView,
  AdminDashboardView,
  createAdminActionCenterService,
  createAdminDashboardService,
  requireAdminPermission,
} from "@/src/modules/admin";

export default async function AdminDashboardPage() {
  const context = await requireAdminPermission("admin.dashboard.view");
  const [dashboard, actionCenter] = await Promise.all([
    createAdminDashboardService().getDashboard(),
    createAdminActionCenterService().getActionCenter(context.permissions),
  ]);

  return (
    <div className="space-y-8">
      <AdminActionCenterView center={actionCenter} />
      <AdminDashboardView dashboard={dashboard} />
    </div>
  );
}
