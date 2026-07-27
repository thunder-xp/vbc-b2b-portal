import { AdminSupportPageView } from "@/src/modules/admin";

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  return <AdminSupportPageView page={Number(page ?? 1)} view="finance" />;
}
