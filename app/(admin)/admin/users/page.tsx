import {
  AdminUserDirectory,
  createAdminIdentityService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPagePermission("admin.users.view");
  const query = await searchParams;
  const users = await createAdminIdentityService().listUsers({
    page: first(query.page),
    search: first(query.search),
    filter: first(query.filter),
  });
  return <AdminUserDirectory users={users} />;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
