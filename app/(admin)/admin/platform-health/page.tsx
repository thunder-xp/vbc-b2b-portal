import {
  AdminIntegrationCenterView,
  AdminPageHeader,
  createAdminOperationsService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminPlatformHealthPage() {
  await requireAdminPagePermission("admin.platform_health.view");
  const center = await createAdminOperationsService().getIntegrationCenter();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Состояние локальных read-моделей без запросов к 1С при открытии страницы."
        eyebrow="Платформа"
        title="Здоровье платформы"
      />
      <AdminIntegrationCenterView center={center} />
    </div>
  );
}
