import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components/BehaviorViewEvent";
import { getWorkspaceHomeAction } from "@/src/modules/partner-cabinet/actions/workspace-home.action";
import { OperationalDashboard } from "@/src/modules/partner-cabinet/components/OperationalDashboard";
import { WorkspaceEmptyState } from "@/src/modules/partner-cabinet/components/WorkspaceEmptyState";
import { getPartnerServiceDashboardAction } from "@/src/modules/service-center/actions";
import { ServiceDashboardBlock } from "@/src/modules/service-center/ServiceDashboardBlock";

export default async function CabinetPage() {
  const result = await getWorkspaceHomeAction();
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success) {
    return <WorkspaceEmptyState actionLabel="Обновить страницу" message="Не удалось загрузить данные рабочего пространства. Попробуйте ещё раз позже." title="Данные временно недоступны" />;
  }

  const workspace = result.data;
  return (
    <div className="space-y-6">
      <BehaviorViewEvent
        additionalEvents={workspace.purchasingDynamics ? [{
          dedupeKey: `momentum:${workspace.purchasingDynamics.sourceFingerprint}`,
          eventName: "momentum_prompt_viewed",
          metadataSafe: { status_band: workspace.purchasingDynamics.status },
          route: "/cabinet",
          sourceSurface: "partner_momentum",
        }] : undefined}
        dedupeKey="partner-dashboard-v2"
        eventName="partner_dashboard_viewed"
        route="/cabinet"
        sourceSurface="partner_dashboard"
      />
      <OperationalDashboard workspace={workspace} />
      <Suspense fallback={null}>
        <ServiceDashboard />
      </Suspense>
    </div>
  );
}

async function ServiceDashboard() {
  const result = await getPartnerServiceDashboardAction();
  return <ServiceDashboardBlock items={result.success ? result.data : []} />;
}
