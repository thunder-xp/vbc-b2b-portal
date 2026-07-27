import {
  AdminGovernanceSummary,
  AdminPageHeader,
  createAdminOperationsService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminSecurityPage() {
  await requireAdminPagePermission("admin.security.view");
  const { metrics } = await createAdminOperationsService().getGovernanceSummary("security");
  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Безопасность" title="Центр безопасности" description="Эффективные назначения и риски доступа без сессий, токенов и impersonation." />
      <AdminGovernanceSummary metrics={metrics} />
    </div>
  );
}
