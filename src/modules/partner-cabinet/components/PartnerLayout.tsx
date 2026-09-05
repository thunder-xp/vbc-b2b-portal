import type { ReactNode } from "react";

import type { PartnerWorkspaceAccessState, WorkspaceNavigationItem } from "../services";
import type { WorkspaceQuickActionDto } from "../services";
import type { NotificationSummary } from "../../notifications";
import { PartnerHeader } from "./PartnerHeader";
import { PartnerMobileNavigation } from "./PartnerMobileNavigation";
import { PartnerSidebar } from "./PartnerSidebar";
import { PartnerLocaleProvider, type PartnerLocale } from "../../partner-locale";
import { LiveCommerceSelectionProvider } from "../../catalog/components/LiveCommerceSelectionProvider";

export type PartnerWorkspaceShellContext = {
  locale: PartnerLocale;
  userDisplayName: string;
  userEmail: string;
  companyName: string | null;
  membershipRole: string | null;
  membershipRoleCode: string | null;
  companyLogoUrl: string | null;
  partnerStatus: string | null;
  quickActions: WorkspaceQuickActionDto[];
  accessState: PartnerWorkspaceAccessState;
  navigation: WorkspaceNavigationItem[];
  cartItemCount: number;
  notificationSummary: NotificationSummary;
  canAddSelectionToCart?: boolean;
  canCreateEstimateFromSelection?: boolean;
};

export function PartnerLayout({
  children,
  context,
}: {
  children: ReactNode;
  context: PartnerWorkspaceShellContext;
}) {
  const hasWorkspaceAccess = context.accessState === "active" || context.accessState === "missing_price_type";

  return (
    <PartnerLocaleProvider locale={context.locale}>
    <LiveCommerceSelectionProvider canAddToCart={Boolean(context.canAddSelectionToCart)} canCreateEstimate={Boolean(context.canCreateEstimateFromSelection)}>
    <div className="min-h-screen bg-zinc-50 text-zinc-950" lang={context.locale}>
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-72">
        <PartnerSidebar companyName={context.companyName} hasWorkspaceAccess={hasWorkspaceAccess} navigation={context.navigation} />
      </div>
      <div className="lg:pl-72">
        <PartnerHeader
          context={context}
          mobileNavigation={(
            <PartnerMobileNavigation
              hasWorkspaceAccess={hasWorkspaceAccess}
              companyName={context.companyName}
              navigation={context.navigation}
            />
          )}
        />
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
    </LiveCommerceSelectionProvider>
    </PartnerLocaleProvider>
  );
}
