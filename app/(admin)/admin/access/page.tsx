import {
  AdminAccessInspector,
  createAdminAccessService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPagePermission("admin.security.view");
  const query = await searchParams;
  const search = first(query.search) ?? "";
  const service = createAdminAccessService();
  const [subjects, inspection] = await Promise.all([
    service.listSubjects(search),
    service.inspect(first(query.userId), first(query.companyId)),
  ]);
  return (
    <AdminAccessInspector
      inspection={inspection}
      search={search}
      subjects={subjects}
    />
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
