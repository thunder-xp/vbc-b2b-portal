import {
  AdminPageHeader,
  AdminSyncJobTable,
  createAdminOperationsService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminIntegrationJobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminPagePermission("admin.integrations.view");
  const params = await searchParams;
  const page = await createAdminOperationsService().listSyncJobs({
    domain: scalar(params.domain),
    status: scalar(params.status),
    trigger: scalar(params.trigger),
    from: scalar(params.from),
    to: scalar(params.to),
    page: Number(scalar(params.page) ?? 1),
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Ограниченный журнал ручных интеграционных запусков."
        eyebrow="Интеграции"
        title="Задания"
      />
      <AdminSyncJobTable page={page} />
    </div>
  );
}

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
