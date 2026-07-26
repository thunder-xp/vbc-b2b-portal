import {
  AdminHistory,
  AdminPageHeader,
  createAdminHistoryService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminUserHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPagePermission("admin.audit.view");
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const history = await createAdminHistoryService().listUser(
    userId,
    first(query.page),
  );
  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="События членства, приглашений, разрешений и внутренней роли."
        eyebrow="Пользователь"
        title="История доступа"
      />
      <AdminHistory
        baseHref={`/admin/users/${encodeURIComponent(userId)}/history`}
        history={history}
      />
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
