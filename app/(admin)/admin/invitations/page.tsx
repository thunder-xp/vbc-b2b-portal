import {
  AdminInvitationDirectory,
  createAdminIdentityService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireAdminPagePermission("admin.invitations.view");
  const query = await searchParams;
  const invitations = await createAdminIdentityService().listInvitations({
    page: first(query.page),
    search: first(query.search),
    filter: first(query.filter),
  });
  return (
    <AdminInvitationDirectory
      canManage={context.permissions.includes("company_users.manage")}
      invitations={invitations}
    />
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
