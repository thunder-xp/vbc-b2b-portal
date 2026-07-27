import { AdminSupportPageView } from "@/src/modules/admin";

export default async function AdminEstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  return <AdminSupportPageView page={Number(page ?? 1)} view="estimates" />;
}
