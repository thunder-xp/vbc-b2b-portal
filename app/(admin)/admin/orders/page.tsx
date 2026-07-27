import { AdminOperationalPageView } from "@/src/modules/admin";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  return <AdminOperationalPageView page={Number(page ?? 1)} view="orders" />;
}
