import {
  AdminHistory,
  AdminPageHeader,
  createAdminHistoryService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPagePermission("admin.audit.view");
  const { page } = await searchParams;
  const history = await createAdminHistoryService().listGlobal(page);
  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Безопасность" title="Журнал аудита" description="Пагинированные безопасные события доступа и административных изменений." />
      <AdminHistory baseHref="/admin/audit" history={history} />
    </div>
  );
}
