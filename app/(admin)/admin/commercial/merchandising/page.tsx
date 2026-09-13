import { redirect } from "next/navigation";

export default async function LegacyMerchandisingPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("q", query.search.trim());
  if (query.page) params.set("page", query.page);
  redirect(params.size ? `/admin/catalog?${params}` : "/admin/catalog");
}
