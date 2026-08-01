import {
  AdminIntegrationCenterView,
  AdminPageHeader,
  AdminSyncControls,
  createAdminOperationsService,
  requireAdminPagePermission,
} from "@/src/modules/admin";
import { ProductRelationAdminPanel } from "@/src/modules/product-relations";

export default async function AdminIntegrationsPage() {
  await requireAdminPagePermission("admin.integrations.view");
  const center = await createAdminOperationsService().getIntegrationCenter();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Состояние интеграционных read-моделей и явные управляемые запуски."
        eyebrow="Интеграции"
        title="Центр интеграций"
      />
      <AdminIntegrationCenterView center={center} />
      <ProductRelationAdminPanel />
      <AdminSyncControls />
    </div>
  );
}
