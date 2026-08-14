import {
  AdminPublicPartnerDirectory,
  createAdminPublicPartnerDirectoryService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminPublicPartnerDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPagePermission("admin.catalog.manage");
  const query = await searchParams;
  const page = await createAdminPublicPartnerDirectoryService().list({
    page: first(query.page),
    search: first(query.search),
    filter: first(query.filter),
  });
  return <AdminPublicPartnerDirectory page={page} />;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
