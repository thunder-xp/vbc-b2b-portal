import { redirect } from "next/navigation";

import { requireAdminPagePermission } from "@/src/modules/admin";

export default async function AdminCompanyUsersCompatibilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPagePermission("admin.users.view");
  const { companyId } = await searchParams;
  const id = Array.isArray(companyId) ? companyId[0] : companyId;
  redirect(
    id
      ? `/admin/companies/${encodeURIComponent(id)}?tab=users`
      : "/admin/companies",
  );
}
