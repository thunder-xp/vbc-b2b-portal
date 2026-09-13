import {
  AdminOperationalIssueList,
  AdminPageHeader,
  createAdminOperationsService,
  requireAnyAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminOperationalIssuesPage() {
  await requireAnyAdminPagePermission(["admin.dashboard.view", "admin.integrations.view"]);
  const issues = await createAdminOperationsService().listOperationalIssues();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`Только активные проблемы: ${issues.length}. Устранённые состояния исчезают автоматически.`}
        eyebrow="Операции"
        title="Требуется внимание"
      />
      <AdminOperationalIssueList issues={issues} />
    </div>
  );
}
