import {
  AdminDashboardView,
  createAdminDashboardService,
  requireAdminPermission,
} from "@/src/modules/admin";
import { AdminServiceAttention, getAdminServiceAttentionAction } from "@/src/modules/service-center";

export default async function AdminDashboardPage() {
  await requireAdminPermission("admin.dashboard.view");
  const [dashboard, serviceResult] = await Promise.all([
    createAdminDashboardService().getDashboard(),
    getAdminServiceAttentionAction(),
  ]);

  return <div className="space-y-6"><AdminDashboardView dashboard={dashboard} /><AdminServiceAttention items={serviceResult.success ? serviceResult.data : []} /></div>;
}
