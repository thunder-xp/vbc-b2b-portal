import { AdminCommercialPage } from "@/src/modules/admin";

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  return <AdminCommercialPage domain="catalog" search={search} />;
}
