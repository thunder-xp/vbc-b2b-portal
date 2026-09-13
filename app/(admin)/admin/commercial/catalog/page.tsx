import { redirect } from "next/navigation";

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const params = new URLSearchParams();
  if (search?.trim()) params.set("q", search.trim());
  redirect(params.size ? `/admin/catalog?${params}` : "/admin/catalog");
}
