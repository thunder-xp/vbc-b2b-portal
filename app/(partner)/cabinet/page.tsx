import { redirect } from "next/navigation";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components/BehaviorViewEvent";
import { getWorkspaceHomeAction } from "@/src/modules/partner-cabinet/actions/workspace-home.action";
import { OperationalDashboard } from "@/src/modules/partner-cabinet/components/OperationalDashboard";
import { WorkspaceEmptyState } from "@/src/modules/partner-cabinet/components/WorkspaceEmptyState";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { partnerText } from "@/src/modules/partner-locale";
import { canonicalizeLegacyRollingPeriodParams, parseRollingPeriodState, resolveRollingPeriod } from "@/src/modules/commerce-period";

export default async function CabinetPage({ searchParams = Promise.resolve({}) }: { searchParams?: Promise<{ period?: string | string[]; popularPeriod?: string | string[]; newPeriod?: string | string[]; hotPeriod?: string | string[] }> } = {}) {
  const params = await searchParams;
  const repeatState = parseRollingPeriodState(single(params.period));
  if (params.popularPeriod || params.newPeriod || params.hotPeriod) {
    redirect(repeatState ? `/cabinet?period=${repeatState}` : "/cabinet");
  }
  const canonicalHref = canonicalizeLegacyRollingPeriodParams("/cabinet", params, ["period"]);
  if (canonicalHref) redirect(canonicalHref);
  const [result, locale] = await Promise.all([getWorkspaceHomeAction({ repeat: resolveRollingPeriod(repeatState) }), getPartnerLocale()]);
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
      <OperationalDashboard locale={locale} periods={{ repeat: repeatState }} workspace={workspace} />
    </div>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
