import { getOneCEnv } from "@/src/lib/env";
import {
  AdminPageHeader,
  requireAdminPagePermission,
} from "@/src/modules/admin";
import { OneCHealthPanel } from "@/src/modules/integration/components/OneCHealthPanel";
import {
  inspectOneCConfiguration,
  ONE_C_DIAGNOSTIC_VERSION,
} from "@/src/modules/integration/providers/one-c/one-c-health-check";

export default async function OneCHealthPage() {
  await requireAdminPagePermission("admin.integrations.view");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Безопасная проверка конфигурации и явно запускаемая диагностика подключения. Секреты и данные 1С не отображаются."
        eyebrow="Интеграции"
        title="Диагностика 1С"
      />
      <OneCHealthPanel
        configuration={inspectOneCConfiguration(getOneCEnv())}
        deployment={{
          diagnosticVersion: ONE_C_DIAGNOSTIC_VERSION,
          commitSha:
            process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "Недоступен",
          deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? "Недоступен",
        }}
      />
    </div>
  );
}
