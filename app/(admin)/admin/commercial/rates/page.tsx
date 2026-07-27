import { getCommercialRateAdminViewAction } from "@/src/modules/pricing-inventory/actions";
import { CommercialRateAdminPanel } from "@/src/modules/pricing-inventory/components";
import {
  AdminPageHeader,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminCommercialRatesPage() {
  await requireAdminPagePermission("admin.rates.view");
  const result = await getCommercialRateAdminViewAction();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="История и управляемая публикация коммерческих курсов."
        eyebrow="Коммерческие данные"
        title="Коммерческие курсы"
      />
      {result.success ? (
        <CommercialRateAdminPanel data={result.data} />
      ) : (
        <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Данные курса недоступны.
        </p>
      )}
    </div>
  );
}
