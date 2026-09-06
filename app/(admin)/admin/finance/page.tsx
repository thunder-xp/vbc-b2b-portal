import { AdminSupportPageView } from "@/src/modules/admin";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createFinanceOperationsService } from "@/src/modules/finance/actions/service-factory";
import { AdminFinanceOperationsPanel } from "@/src/modules/finance/components";

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  await requireAdminPagePermission("admin.finance.view");
  const operations = await createFinanceOperationsService().getOperations();
  return <div className="space-y-6"><AdminFinanceOperationsPanel data={operations} /><AdminSupportPageView page={Number(page ?? 1)} view="finance" /></div>;
}
