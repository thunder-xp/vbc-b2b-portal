import { redirect } from "next/navigation";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components/BehaviorViewEvent";
import { getWorkspaceHomeAction } from "@/src/modules/partner-cabinet/actions/workspace-home.action";
import { OperationalDashboard } from "@/src/modules/partner-cabinet/components/OperationalDashboard";
import { WorkspaceEmptyState } from "@/src/modules/partner-cabinet/components/WorkspaceEmptyState";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { partnerText } from "@/src/modules/partner-locale";

export default async function CabinetPage() {
  const [result, locale] = await Promise.all([getWorkspaceHomeAction(), getPartnerLocale()]);
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success) {
    return <WorkspaceEmptyState actionLabel={partnerText(locale, "dashboard.refreshPage")} message={partnerText(locale, "dashboard.loadErrorMessage")} title={partnerText(locale, "dashboard.loadErrorTitle")} />;
  }

  const workspace = result.data;
  return (
    <div className="space-y-6">
      <BehaviorViewEvent
        dedupeKey="partner-dashboard-v2"
        eventName="partner_dashboard_viewed"
        route="/cabinet"
        sourceSurface="partner_dashboard"
      />
      <OperationalDashboard locale={locale} workspace={workspace} />
    </div>
  );
}
