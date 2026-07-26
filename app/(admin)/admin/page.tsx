import {
  AdminDashboardView,
  createAdminDashboardService,
  requireAdminPermission,
} from "@/src/modules/admin";

export default async function AdminDashboardPage() {
  await requireAdminPermission("admin.dashboard.view");
  const dashboard = await createAdminDashboardService().getDashboard();

  return <AdminDashboardView dashboard={dashboard} />;
}
