import {
  AdminCompanyDirectory,
  createAdminCompanyService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPagePermission("admin.companies.view");
  const query = await searchParams;
  const companies = await createAdminCompanyService().list({
    page: first(query.page),
    search: first(query.search),
    filter: first(query.filter),
  });

  return <AdminCompanyDirectory companies={companies} />;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
