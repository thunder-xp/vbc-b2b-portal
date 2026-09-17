import { AdminSupportPageView } from "@/src/modules/admin";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createFinanceOperationsService } from "@/src/modules/finance/actions/service-factory";
import { AdminFinanceOperationsPanel } from "@/src/modules/finance/components";
import { AdminMaibPaymentDiagnostics } from "@/src/modules/payments/components/AdminMaibPaymentDiagnostics";
import { getRecentRetailPaymentStates, maibConfigurationSummary } from "@/src/modules/payments/server";

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  await requireAdminPagePermission("admin.finance.view");
  const [operations, payments] = await Promise.all([
    createFinanceOperationsService().getOperations(),
    getRecentRetailPaymentStates(50).catch(() => []),
  ]);
  return <div className="space-y-6"><AdminMaibPaymentDiagnostics configuration={maibConfigurationSummary()} payments={payments} /><AdminFinanceOperationsPanel data={operations} /><AdminSupportPageView page={Number(page ?? 1)} view="finance" /></div>;
}
