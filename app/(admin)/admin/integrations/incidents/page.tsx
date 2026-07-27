import {
  AdminIncidentList,
  AdminPageHeader,
  createAdminOperationsService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminIntegrationIncidentsPage() {
  await requireAdminPagePermission("admin.integrations.view");
  const incidents = await createAdminOperationsService().listIncidents();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Безопасные категории сбоев и рекомендуемые действия без коммерческих данных."
        eyebrow="Интеграции"
        title="Инциденты"
      />
      <AdminIncidentList incidents={incidents} />
    </div>
  );
}
